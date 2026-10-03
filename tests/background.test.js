const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function setup(fails = false) {
  let listener;
  const calls = [];
  const chrome = {
    action: {
      onClicked: { addListener(fn) { listener = fn; } },
      async setBadgeText(value) { calls.push(['badge', value]); },
      async setTitle(value) { calls.push(['title', value]); },
    },
    scripting: { async executeScript(value) { calls.push(['inject', value]); if (fails) throw new Error('Restricted URL'); } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), { chrome, console: { warn() {} } });
  return { run: tab => listener(tab), calls };
}
test('manifest has runnable entrypoints and minimal permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  assert.ok(fs.existsSync(path.join(root, manifest.background.service_worker)));
});
test('toolbar action injects scripts in dependency order into the clicked tab', async () => {
  const { run, calls } = setup();
  await run({ id: 42 });
  assert.equal(calls[0][1].target.tabId, 42);
  assert.deepEqual(Array.from(calls[0][1].files), ['core.js', 'content.js']);
  assert.equal(calls[1][1].text, '');
});
test('restricted page reports failure without throwing', async () => {
  const { run, calls } = setup(true);
  await run({ id: 42 });
  assert.equal(calls[1][1].text, '!');
  assert.match(calls[2][1].title, /실행할 수 없습니다/);
});
test('missing tab does not attempt injection', async () => {
  const { run, calls } = setup();
  await run({});
  assert.equal(calls.length, 0);
});
