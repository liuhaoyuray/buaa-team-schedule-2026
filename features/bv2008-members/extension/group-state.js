(() => {
  const sourceWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  const bridgeVersion = '0.3.0';
  const requestEvent = 'buaa-volunteer-read-group';
  const responseEvent = 'buaa-volunteer-group-result';
  if (globalThis.__buaaGroupBridgeVersion === bridgeVersion) return;
  globalThis.__buaaGroupBridgeVersion = bridgeVersion;

  function unwrap(value) {
    for (let depth = 0; depth < 3; depth++) {
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return value; }
      } else if (value && typeof value === 'object' && !value.currOrgInfoActive && 'value' in value) {
        value = value.value;
      } else {
        break;
      }
    }
    return value;
  }

  function group(value) {
    const id = String(value?.orgId ?? '').trim();
    const name = String(value?.orgName ?? '').trim();
    return id && name ? {id, name} : null;
  }

  function readLiveState() {
    const app = sourceWindow.document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    if (!pinia?._s || typeof pinia._s.values !== 'function') return {available: false};
    const groups = new Map();
    let available = false;
    for (const store of pinia._s.values()) {
      if (!('userInfo' in store)) continue;
      available = true;
      const current = group(store.userInfo?.currOrgInfoActive);
      if (current) groups.set(current.id, current);
    }
    return {available, group: groups.size === 1 ? [...groups.values()][0] : null};
  }

  function readState() {
    try {
      const live = readLiveState();
      if (live.available) return live.group;
      const info = unwrap(sourceWindow.localStorage.getItem('zybjpc-user-info'));
      const active = group(info?.currOrgInfoActive);
      const selected = String(unwrap(sourceWindow.localStorage.getItem('zybjpc-default-org-id')) ?? '').trim();
      if (active && (!selected || selected === active.id)) return active;
      const candidates = info?.currUserRoleInfo?.currOrgInfo;
      if (!selected || !Array.isArray(candidates)) return null;
      return group(candidates.find(candidate => String(candidate.orgId) === selected));
    } catch {
      return null;
    }
  }

  document.addEventListener(requestEvent, () => {
    document.dispatchEvent(new CustomEvent(responseEvent, {detail: JSON.stringify(readState())}));
  });
})();
