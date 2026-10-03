(() => {
  const KEY = '__pickFilterV1';
  if (globalThis[KEY]) return;
  const { parseCount, readCount, candidates, scopeKey, recipeFor, restoreRecipe } = globalThis.PickFilterCore;
  let storageKey = scopeKey(location.href);
  const host = document.createElement('div');
  host.hidden = true;
  host.style.cssText = 'all:initial;position:fixed;right:20px;top:20px;z-index:2147483647;';
  // all:initial overrides the browser's default [hidden] display rule.
  function setPanelVisible(visible) {
    host.hidden = !visible;
    host.style.setProperty('display', visible ? 'block' : 'none', 'important');
  }
  setPanelVisible(false);
  const shadow = host.attachShadow({ mode: 'open' });
  // Shadow DOM retargets input events to the host div, so page shortcut handlers
  // may mistake typing here for a page-level shortcut. Keep editing defaults.
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'change',
    'compositionstart', 'compositionupdate', 'compositionend', 'copy', 'cut', 'paste']) {
    shadow.addEventListener(type, event => event.stopPropagation());
  }
  shadow.innerHTML = `
    <style>
      :host{color-scheme:light}*{box-sizing:border-box}section{width:340px;max-width:calc(100vw - 32px);max-height:90vh;overflow:auto;background:#fff;color:#1e293b;border:1px solid #cbd5e1;border-radius:16px;box-shadow:0 12px 45px #0f172a33;font:14px/1.6 system-ui,sans-serif;padding:20px}
      header{display:flex;justify-content:space-between;align-items:center}h2{font-size:20px;margin:0}p{margin:10px 0}small{color:#64748b}button,input{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px;background:white;color:#1e293b}button{cursor:pointer}button:hover{background:#f1f5f9}button:disabled{opacity:.45;cursor:default}button.primary{background:#2563eb;color:white;border-color:#2563eb}button:focus-visible,input:focus-visible{outline:3px solid #93c5fd}input{width:100%;margin:6px 0 10px}.row{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}[hidden]{display:none!important}#preview{white-space:pre-line;background:#f1f5f9;border-radius:8px;padding:10px;max-height:160px;overflow:auto}#status{padding-top:10px;border-top:1px solid #e2e8f0}label{font-weight:600}
    </style>
    <section aria-label="PickFilter 설정">
      <header><h2>PickFilter</h2><button id="close" aria-label="패널 닫기">✕</button></header>
      <small>게시판별 저장 · 숫자 조건 필터</small>
      <p>조회수·댓글수 등 원하는 숫자를 선택하고, 게시글 범위를 확인하세요.</p>
      <button id="pick" class="primary">숫자 항목 선택</button>
      <div id="selection" hidden>
        <div class="row"><button id="smaller">범위 좁히기</button><button id="larger">범위 넓히기</button></div>
        <div id="preview"></div>
        <div class="row"><button id="confirm">이 범위 확정</button></div>
      </div>
      <label for="threshold">최소값 (이상)</label>
      <input id="threshold" inputmode="numeric" placeholder="예: 1,000" value="1000">
      <div class="row"><button id="apply" class="primary" disabled>적용</button><button id="reset">필터 해제</button></div>
      <p id="status" role="status" aria-live="polite">필터링할 숫자를 선택해 시작하세요.</p>
      <small>적용한 설정은 같은 게시판의 다음 페이지와 새로고침 후에도 유지됩니다.</small>
    </section>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  const token = `data-pickfilter-${crypto.randomUUID()}`;
  const style = document.createElement('style');
  style.textContent = `[${token}="hidden"]{display:none!important}[${token}="row"]{outline:2px solid #2563eb!important;outline-offset:-2px!important}[${token}="hover"]{outline:3px solid #f59e0b!important;outline-offset:-3px!important}`;
  document.documentElement.append(style);
  const marked = new Set();
  let options = [], index = 0, confirmed = false, picking = false, hover = null;
  let active = false, touched = false, savedRecipe = null, savedThreshold = 1000, currentRecipe = null;
  let saveQueue = Promise.resolve();
  shadow.addEventListener('click', () => { touched = true; }, true);
  shadow.addEventListener('input', () => { touched = true; }, true);
  function persist(enabled) {
    if (!savedRecipe) return;
    const settings = { recipe: savedRecipe, threshold: savedThreshold, enabled };
    saveQueue = saveQueue.then(() => chrome.storage.local.set({ [storageKey]: settings })).catch(() => {
      status('현재 필터는 적용됐지만 설정 저장에 실패했습니다. 확장을 다시 로드하세요.');
    });
  }
  const status = message => { $('status').textContent = message; };
  function clearMarks() {
    marked.forEach(el => el.removeAttribute(token));
    // Some renderers clone nodes, including our transient attributes.
    document.querySelectorAll('[' + token + ']').forEach(el => el.removeAttribute(token));
    marked.clear();
  }
  function mark(el, value) { el.setAttribute(token, value); marked.add(el); }
  function stopPicking() {
    picking = false;
    document.removeEventListener('pointerover', onHover, true);
    document.removeEventListener('click', onPick, true);
    if (hover) { hover.removeAttribute(token); hover = null; }
  }
  function onHover(event) {
    if (event.composedPath().includes(host)) return;
    if (hover) hover.removeAttribute(token);
    hover = event.target;
    if (hover instanceof Element) hover.setAttribute(token, 'hover');
  }
  function showPreview() {
    clearMarks();
    const option = options[index];
    const readings = option.readings;
    readings.forEach(item => mark(item.row, 'row'));
    const parsed = readings.map(item => readCount(item.element?.textContent ?? ''));
    $('preview').textContent = `${option.row.tagName.toLowerCase()} 영역 · ${readings.length}개 항목\n` +
      parsed.slice(0, 8).map((count, i) => `${i + 1}. ${count === null ? '판독 불가' : count.toLocaleString() + '건'}`).join('\n');
    $('smaller').disabled = index === 0;
    $('larger').disabled = index === options.length - 1;
    $('confirm').disabled = parsed.filter(n => n !== null).length < 2;
    $('selection').hidden = false;
    $('apply').disabled = true;
    confirmed = false; currentRecipe = null;
    status('파란 테두리가 게시글 전체인지 확인하세요. 숫자 칸만 선택됐다면 범위를 넓히세요.');
  }
  function onPick(event) {
    if (event.composedPath().includes(host)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const selected = event.target;
    if (!(selected instanceof Element) || readCount(selected.textContent) === null) {
      status('숫자 또는 [74] 같은 댓글수 표시를 클릭하세요. Esc로 취소할 수 있습니다.'); return;
    }
    options = candidates(selected);
    if (!options.length) { status('반복되는 게시글 구조를 찾지 못했습니다. 다른 숫자 항목을 선택하세요.'); return; }
    stopPicking();
    // Prefer an entire table row or an item containing a link over a numeric sub-cell.
    const preferred = options.findIndex(option => option.row.matches('tr, article, li') || option.row.querySelector('a[href]'));
    index = preferred < 0 ? 0 : preferred;
    showPreview();
  }
  $('pick').onclick = () => {
    storageKey = scopeKey(location.href);
    stopPicking(); clearMarks(); active = false; confirmed = false; currentRecipe = null;
    $('apply').disabled = true; $('selection').hidden = true;
    picking = true;
    document.addEventListener('pointerover', onHover, true);
    document.addEventListener('click', onPick, true);
    status('페이지의 조회수·댓글수 숫자를 클릭하세요. Esc로 취소합니다.');
  };
  $('smaller').onclick = () => { index--; showPreview(); };
  $('larger').onclick = () => { index++; showPreview(); };
  $('confirm').onclick = () => {
    currentRecipe = recipeFor(options[index]);
    $('selection').hidden = true;
    confirmed = true; clearMarks(); $('apply').disabled = false;
    status('범위를 확정했습니다. 최소값을 입력하고 적용하세요.');
  };
  function applyFilter(save = true) {
    if (!currentRecipe) return;
    const threshold = save ? parseCount($('threshold').value) : savedThreshold;
    if (threshold === null) { status('최소값은 0 이상의 정수로 입력하세요. 예: 1,000'); return; }
    const option = restoreRecipe(currentRecipe);
    if (!option) {
      clearMarks(); confirmed = false; $('apply').disabled = true;
      status('저장된 숫자 위치를 찾지 못했습니다. 목록 갱신을 기다리는 중입니다. 계속되면 다시 선택하세요.');
      return;
    }
    options = [option]; index = 0; confirmed = true; $('apply').disabled = false;
    const readings = option.readings;
    clearMarks();
    let shown = 0, hidden = 0, unknown = 0;
    for (const item of readings) {
      const count = readCount(item.element?.textContent ?? '');
      if (count === null) unknown++;
      else if (count < threshold) { mark(item.row, 'hidden'); hidden++; }
      else shown++;
    }
    active = true;
    if (save) { savedRecipe = currentRecipe; savedThreshold = threshold; persist(true); }
    status(`조건 일치 ${shown}개 · 숨김 ${hidden}개 · 판독 불가 ${unknown}개 (유지)` + (shown === 0 ? '\n조건에 맞는 게시글이 없습니다.' : ''));
  };
  $('apply').onclick = () => applyFilter();
  $('reset').onclick = () => { stopPicking(); clearMarks(); active = false; persist(false); status('필터를 해제했습니다. 원래 목록을 표시합니다.'); };
  function hidePanel() {
    stopPicking();
    if (!active) clearMarks();
    setPanelVisible(false);
  }
  $('close').onclick = hidePanel;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picking) { stopPicking(); status('선택을 취소했습니다.'); }
  }, true);
  // Observe page content, not our UI or filtering attributes, so replacement
  // lists and delayed rendering can recover without creating a mutation loop.
  let refreshTimer;
  const observer = new MutationObserver(() => {
    if (!currentRecipe || !active || picking) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!currentRecipe || !active || picking) return;
      if (scopeKey(location.href) !== storageKey) {
        clearMarks(); active = false; currentRecipe = null; confirmed = false;
        $('apply').disabled = true;
        status('다른 목록으로 이동했습니다. 이 목록의 숫자 항목을 선택하세요.');
        return;
      }
      applyFilter(false);
    }, 100);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'id'] });
  globalThis[KEY] = { toggle: () => {
    if (host.hidden) setPanelVisible(true);
    else hidePanel();
  } };
  (async () => {
    try {
      const saved = (await chrome.storage.local.get(storageKey))[storageKey];
      if (!saved || touched) return;
      savedRecipe = saved.recipe;
      if (parseCount(saved.threshold) === null) return;
      savedThreshold = saved.threshold;
      $('threshold').value = saved.threshold;
      currentRecipe = saved.recipe;
      active = !!saved.enabled;
      const option = restoreRecipe(currentRecipe);
      if (option) {
        // Upgrade earlier recipes when their original location is still valid.
        if (!currentRecipe.version) {
          savedRecipe = currentRecipe = recipeFor(option);
          persist(active);
        }
        options = [option]; index = 0; confirmed = true;
        $('apply').disabled = false;
      }
      if (active) applyFilter(false);
      else if (option) status('저장된 설정을 불러왔습니다. 적용을 누르면 필터를 다시 켭니다.');
      else status('저장된 숫자 위치를 찾지 못했습니다. 목록 구조를 확인하고 다시 선택하세요.');
    } catch {
      status('저장된 설정을 불러오지 못했습니다. 숫자 항목을 다시 선택하세요.');
    }
  })();
})();
