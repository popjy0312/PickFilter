// Dependency-free Chrome integration checks using the DevTools protocol.
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'pickfilter-test-'));
  const fixture = await readFile(path.join(__dirname, 'fixture.html'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(port, 'Chrome remote debugging started');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const result = JSON.parse(data);
      if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); }
    };
    async function send(method, params = {}) {
      const callId = ++id;
      const reply = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(callId); reject(new Error(`Timeout: ${method}`)); }, 10000);
        pending.set(callId, result => { clearTimeout(timeout); resolve(result); });
      });
      socket.send(JSON.stringify({ id: callId, method, params }));
      const result = await reply;
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result.result;
    }
    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate("document.querySelectorAll('#posts tr').length === 6")) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const code = await readFile(path.join(root, 'core.js'), 'utf8') + '\n' + await readFile(path.join(root, 'content.js'), 'utf8');
    await evaluate(code);
    await evaluate(`globalThis.panel = [...document.documentElement.children].find(el => el.shadowRoot)?.shadowRoot;
      globalThis.button = id => panel.getElementById(id);
      globalThis.visibleRows = () => [...document.querySelectorAll('#posts tr')].filter(el => getComputedStyle(el).display !== 'none').length;
      globalThis.choose = selector => { button('pick').click(); document.querySelector(selector).click(); button('confirm').click(); };
      globalThis.apply = value => { button('threshold').value = value; button('apply').click(); };`);
    assert.equal(await evaluate('!!panel'), true);
    await evaluate("choose('#pick-target'); apply('1,000')");
    assert.equal(await evaluate('visibleRows()'), 4, 'two matches plus two unreadable rows remain');
    assert.match(await evaluate("button('status').textContent"), /조건 일치 2개 · 숨김 2개 · 판독 불가 2개/);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#outside')).display !== 'none' && getComputedStyle(document.querySelector('#pagination')).display !== 'none'"), true, 'outside elements unaffected');
    await evaluate("apply('0')");
    assert.equal(await evaluate('visibleRows()'), 6, 'lowering threshold restores rows');
    await evaluate("apply('9999')");
    assert.equal(await evaluate('visibleRows()'), 2, 'unreadable rows remain with no matches');
    assert.match(await evaluate("button('status').textContent"), /조건에 맞는 게시글이 없습니다/);
    await evaluate("apply('-1')");
    assert.match(await evaluate("button('status').textContent"), /0 이상의 정수/);
    assert.equal(await evaluate('visibleRows()'), 2, 'invalid input preserves current filter');
    await evaluate("button('reset').click()");
    assert.equal(await evaluate('visibleRows()'), 6, 'reset restores');
    await evaluate("button('pick').click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.match(await evaluate("button('status').textContent"), /취소/);
    await evaluate("choose('#pick-target'); apply('1000'); button('close').click()");
    assert.equal(await evaluate('visibleRows()'), 4, 'closing retains filter');
    await evaluate(code);
    assert.equal(await evaluate("[...document.documentElement.children].filter(el => el.shadowRoot).length"), 1, 'reinjection reuses panel');
    assert.equal(await evaluate('panel.host.hidden'), false, 'reinjection opens panel');
    await evaluate("button('reset').click(); choose('#card-target'); apply('1000')");
    assert.equal(await evaluate("[...document.querySelectorAll('.card')].filter(el => getComputedStyle(el).display !== 'none').length"), 1, 'card structure filters independently');
    assert.equal(await evaluate('visibleRows()'), 6, 'table unaffected by card filter');
    await evaluate("button('reset').click(); choose('#pick-target'); document.querySelector('#posts tr').remove(); apply('1000')");
    assert.match(await evaluate("button('status').textContent"), /목록 구조가 변경/);
    assert.equal(await evaluate('visibleRows()'), 5, 'changed structure does not hide stale selection');
    console.log('PASS: Chrome DOM integration — selection, table/card scopes, thresholds, invalid counts, restoration, Esc, reinjection, stale DOM.');
  } finally {
    if (socket) socket.close();
    server.close();
    chrome.kill('SIGTERM');
    await new Promise(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
