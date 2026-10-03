chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.js', 'content.js'],
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
