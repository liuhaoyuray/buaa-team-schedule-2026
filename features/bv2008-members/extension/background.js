chrome.action.onClicked.addListener(async tab => {
  const url = new URL(chrome.runtime.getURL('index.html'));
  if (Number.isInteger(tab.id) && /^https:\/\/(?:www\.|test1\.)?bv2008\.cn\//.test(tab.url || '')) {
    url.searchParams.set('tab', String(tab.id));
    if (new URL(tab.url).hash.split('?')[0] === '#/projectActivityManage/myProject/recruitVolunteers') {
      url.searchParams.set('mode', 'activity');
    }
    if (new URL(tab.url).hash.split('?')[0] === '#/projectActivityManage/myProject/durationInput') {
      url.pathname = '/hours.html';
    }
  }
  await chrome.tabs.create({url: url.href});
});
