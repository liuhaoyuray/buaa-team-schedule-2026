(() => {
  if (document.getElementById('buaa-volunteer-batch-panel')) return;
  const host = document.createElement('div');
  host.id = 'buaa-volunteer-batch-panel';
  host.style.cssText = 'position:fixed;right:16px;top:70px;z-index:2147483000;max-width:calc(100vw - 20px)';
  const shadow = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = /*__PANEL_CSS__*/'';
  shadow.append(style);
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'primary';
  launcher.textContent = '批量录入';
  launcher.id = 'buaa-launcher';
  shadow.append(launcher);
  const panel = document.createElement('div');
  panel.id = 'buaa-panel';
  panel.hidden = true;
  shadow.append(panel);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'buaa-close';
  close.textContent = '收起面板';
  let controller = null;
  let currentMode = null;
  document.body.append(host);

  const modeForPage = () => location.hash.startsWith('#/projectActivityManage/myProject/durationInput')
    ? 'hours' : location.hash.startsWith('#/projectActivityManage/myProject/recruitVolunteers') ? 'activity' : 'member';
  function mount(selectedMode) {
    controller?.abort();
    controller = new AbortController();
    currentMode = selectedMode;
    panel.innerHTML = selectedMode === 'hours' ? /*__HOURS_HTML__*/'' : /*__PANEL_HTML__*/'';
    panel.prepend(close);
    panel.hidden = false;
    launcher.hidden = true;
    const environment = {
      ExcelJS,
      root: shadow,
      parameters: new URLSearchParams({mode: selectedMode}),
      signal: controller.signal,
      storage: {
        async get(key) { return {[key]: await GM.getValue(key)}; },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            await GM.setValue(key, JSON.parse(JSON.stringify(value)));
          }
        },
      },
      message(message) {
        const adapter = message.type.startsWith('hours-') ? globalThis.__buaaHoursAdapter
          : message.type.startsWith('activity-') ? globalThis.__buaaActivityAdapter : globalThis.__buaaMemberAdapter;
        return adapter.handle(message);
      },
      readTarget(mode) { return this.message({type: mode + '-target'}); },
      openTarget(url) { panel.hidden = true; launcher.hidden = false; location.href = url; },
    };
    for (const selected of ['member', 'activity', 'hours']) {
      shadow.getElementById('mode-' + selected).addEventListener('click', event => {
        event.preventDefault();
        if (shadow.getElementById('confirm')?.disabled || shadow.getElementById('hours-confirm')?.disabled) {
          (shadow.getElementById('notice') || shadow.getElementById('hours-status')).textContent = '请先暂停当前批次，处理完当前这条后再切换功能。';
          return;
        }
        mount(selected);
      });
    }
    if (selectedMode === 'hours') {
      /*__HOURS_APP__*/
    } else {
      /*__PANEL_APP__*/
    }
  }
  close.addEventListener('click', () => {
    panel.hidden = true;
    launcher.hidden = false;
  });
  launcher.addEventListener('click', () => {
    if (currentMode === null || (currentMode !== modeForPage() && !shadow.getElementById('confirm')?.disabled)) mount(modeForPage());
    else {
      panel.hidden = false;
      launcher.hidden = true;
      (shadow.getElementById('connect') || shadow.getElementById('hours-connect')).click();
    }
  });
  window.addEventListener('hashchange', () => {
    if (currentMode === null || shadow.getElementById('confirm')?.disabled || shadow.getElementById('hours-confirm')?.disabled) return;
    if (currentMode !== modeForPage() && !panel.hidden) mount(modeForPage());
    else (shadow.getElementById('connect') || shadow.getElementById('hours-connect')).click();
  });
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('显示志愿北京批量录入', () => launcher.click());
  }
})();
