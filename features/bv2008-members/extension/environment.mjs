const parameters = new URL(location.href).searchParams;
const value = parameters.get('tab');
const tabId = /^\d+$/.test(value || '') ? Number(value) : null;
const message = data => chrome.tabs.sendMessage(tabId, data, {frameId: 0});

export const environment = {
  parameters,
  root: document,
  storage: chrome.storage.local,
  message,
  async readTarget(mode) {
    if (tabId === null) return {reason: '请在已登录的志愿北京后台点击扩展图标。'};
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!/^https:\/\/(?:www\.|test1\.)?bv2008\.cn\//.test(tab.url || '')) {
        return {reason: '绑定的标签页已离开志愿北京，请在官网重新打开扩展。'};
      }
      await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['group-state.js']});
      if (mode === 'hours') await chrome.scripting.executeScript({target: {tabId}, world: 'MAIN', files: ['download-bridge.js', 'project-info.js']});
      const files = mode === 'hours' ? ['bv2008.js', 'activity.js', 'hours-adapter.js', 'hours-batch-adapter.js']
        : mode === 'activity' ? ['bv2008.js', 'activity.js'] : ['bv2008.js'];
      await chrome.scripting.executeScript({target: {tabId}, files});
      return await message({type: mode + '-target'});
    } catch {
      return {reason: '网页连接失败。请在扩展的站点权限中允许访问志愿北京，再回官网点击扩展图标。'};
    }
  },
  async openTarget(url) {
    if (tabId !== null) {
      try {
        await chrome.tabs.update(tabId, {active: true});
        return;
      } catch {}
    }
    await chrome.tabs.create({url});
  },
};
