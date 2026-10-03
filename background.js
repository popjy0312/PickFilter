importScripts('core.js');

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.js', 'content.js', 'open.js'],
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: '이 페이지에서 실행할 수 없습니다. 일반 웹페이지에서 다시 시도하세요.',
    });
    console.warn('PickFilter injection failed:', error.message);
  }
});

// activeTab access survives navigation within the origin in the same tab.
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete' || !tab.url || !/^https?:/.test(tab.url)) return;
  try {
    const key = PickFilterCore.scopeKey(tab.url);
    const saved = (await chrome.storage.local.get(key))[key];
    if (!saved) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js', 'content.js'] });
  } catch {
    // Other origins require the user to grant activeTab access again.
  }
});
