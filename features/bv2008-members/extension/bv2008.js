(() => {
  if (globalThis.__buaaMemberAdapter) return;


  const supportedSite = () => location.protocol === 'https:' && /^(?:www\.|test1\.)?bv2008\.cn$/.test(location.hostname);
  const memberRoute = '#/volunteerManage/myMembers';
  const clean = text => String(text || '').replace(/\s+/g, '');
  const visible = element => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible' && !element.closest('[aria-hidden="true"]');
  const find = (scope, selector, label) => {
    const matches = [...scope.querySelectorAll(selector)]
      .filter(element => visible(element) && clean(element.textContent) === label);
    return matches.length === 1 ? matches[0] : null;
  };
  const addButton = () => find(document, 'button', '添加成员');
  const dialog = () => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], .ant-modal')]
      .filter(element => visible(element) && element.querySelector('#basic_name, #basic_certNo'));
    return dialogs.find(element => !dialogs.some(other => other !== element && element.contains(other))) || null;
  };
  const enabled = button => button && !button.disabled &&
    button.getAttribute('aria-disabled') !== 'true' && !button.classList.contains('ant-btn-loading');

  function readTarget(requireAddButton = true) {
    if (!supportedSite() || location.hash.split('?')[0] !== memberRoute) {
      return {reason: '请打开志愿北京的「志愿者管理 → 我的成员 → 正式成员」。'};
    }
    const group = readGroup();
    if (!group) return {reason: '页面已连接，但尚未读到当前团体。请刷新官网，等右上角显示团体名称后重试。'};
    if (requireAddButton && !addButton()) {
      return {reason: '已识别当前团体，请点「正式成员」，等列表上的「添加成员」按钮出现后重试。'};
    }
    return group;
  }

  function readGroup() {
    if (!supportedSite()) return null;
    let value = null;
    const receive = event => {
      try { value = JSON.parse(event.detail); } catch {}
    };
    document.addEventListener('buaa-volunteer-group-result', receive, {once: true});
    document.dispatchEvent(new Event('buaa-volunteer-read-group'));
    document.removeEventListener('buaa-volunteer-group-result', receive);
    return value && typeof value.id === 'string' && typeof value.name === 'string' ? value : null;
  }

  const wait = (check, timeout) => new Promise((resolve, reject) => {
    const observer = new MutationObserver(inspect);
    let finished = false;
    const timer = setTimeout(() => finish(null), timeout);
    const poll = setInterval(inspect, 100);
    function finish(value, error) {
      if (finished) return;
      finished = true;
      observer.disconnect();
      removeEventListener('storage', inspect);
      removeEventListener('hashchange', inspect);
      clearTimeout(timer);
      clearInterval(poll);
      if (error) reject(error);
      else resolve(value);
    }
    function inspect() {
      if (finished) return;
      try {
        const value = check();
        if (value) finish(value);
      } catch (error) {
        finish(null, error);
      }
    }
    observer.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true});
    addEventListener('storage', inspect);
    addEventListener('hashchange', inspect);
    inspect();
  });

  const timing = {page: 45000, search: 60000, submit: 90000, stable: 350};
  const isLoading = scope => [...scope.querySelectorAll(
    '.ant-spin-spinning, .ant-btn-loading, .ant-skeleton, [aria-busy="true"]'
  )].some(visible);

  function waitStable(check, timeout, stableFor = timing.stable, fingerprint = () => true) {
    let since = 0;
    let previous;
    return wait(() => {
      const result = check();
      if (!result) {
        since = 0;
        previous = undefined;
        return null;
      }
      const current = fingerprint();
      if (!since || current !== previous) {
        since = Date.now();
        previous = current;
      }
      const duration = typeof stableFor === 'function' ? stableFor(result) : stableFor;
      return Date.now() - since >= duration ? result : null;
    }, timeout);
  }

  async function submitAndWait(form, button, changed, recognize) {
    const before = new Map(notices().map(({element, text}) => [element, text]));
    let success = null;
    let candidate = null;
    let since = 0;
    const started = Date.now();
    button.click();
    return wait(() => {
      if (changed()) return {status: 'unknown', reason: '提交期间目标页面或团体发生变化，请先核对。'};
      let current = null;
      let key = '';
      for (const {element, text} of notices()) {
        const inlineError = form.contains(element) && element.matches('.ant-form-item-explain-error');
        if (!text || (!inlineError && before.get(element) === text)) continue;
        const result = inlineError
          ? {status: 'rejected', reason: '官网校验姓名或证件号码未通过'}
          : recognize(element, text);
        if (result?.status === 'added') success = result;
        else if (result) {
          current = result;
          key = text;
        }
      }
      const open = form.isConnected && visible(form);
      if (success && !open) return success;
      if (success) return null;
      if (!current || (open && (isLoading(form) || !enabled(button)))) {
        candidate = null;
        since = 0;
        return null;
      }
      if (key !== candidate) {
        candidate = key;
        since = Date.now();
      }
      return Date.now() - started >= 2500 && Date.now() - since >= 1800 ? current : null;
    }, timing.submit);
  }

  function fill(input, value) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }

  const notices = () => [...document.querySelectorAll(
    '.ant-message-notice, .ant-notification-notice, [role="alert"], .ant-form-item-explain-error'
  )].filter(visible).map(element => ({element, text: clean(element.textContent)}));

  function classify(text) {
    if (text === '添加成功') return {status: 'added', reason: '官网提示添加成功'};
    if (/已经?是.{0,12}成员|已(?:经)?加入.{0,12}(?:团体|组织)|已(?:经)?被?添加.{0,12}(?:团体|组织|成员)/.test(text)) {
      return {status: 'existing', reason: '官网提示已是成员'};
    }
    if (/姓名不能为空|证件号码不能为空|(?:证件|身份证)(?:号码|号)?(?:格式)?(?:有误|错误|无效|不正确)|请输入(?:正确|有效)的?(?:身份证|证件)/.test(text)) {
      return {status: 'rejected', reason: '官网校验姓名或证件号码未通过'};
    }
    if (/未(?:查询|查找|搜索|找)到.{0,12}志愿者|志愿者.{0,12}(?:不存在|未注册|未实名)|姓名.{0,12}(?:证件|身份证).{0,10}不匹配/.test(text)) {
      return {status: 'rejected', reason: '官网未匹配到可添加的志愿者'};
    }
    return null;
  }

  let busy = false;
  async function submit({orgId, name, cert}) {
    const blocked = reason => ({status: 'blocked', reason});
    const unknown = reason => ({status: 'unknown', reason});
    if (busy) return blocked('这个官网标签页已有一批正在处理。');
    const initial = readTarget(false);
    if (location.hash.split('?')[0] !== memberRoute || (initial.id && initial.id !== orgId)) {
      return blocked('官网团体或页面已变化，请重新核对。');
    }
    if (dialog() || document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])')) {
      return blocked('请先处理官网已经打开的弹窗，再继续。');
    }
    busy = true;
    let clicked = false;
    try {
      const page = addButton()?.closest('.page-container') || document;
      const ready = await waitStable(() => {
        if (location.hash.split('?')[0] !== memberRoute) return {changed: true};
        const current = readTarget(false);
        if (current.id && current.id !== orgId) return {changed: true};
        return current.id === orgId && enabled(addButton()) && !isLoading(page) ? {button: addButton()} : null;
      }, timing.page);
      if (!ready) return blocked('官网仍在加载，已保留进度。请等待加载结束后继续。');
      if (ready.changed) return blocked('团体或页面已变化，请重新核对。');
      ready.button.click();
      const form = await waitStable(() => {
        const form = dialog();
        return form?.querySelector('input#basic_name') && form.querySelector('input#basic_certNo') &&
          enabled(find(form, 'button', '确定')) && enabled(find(form, 'button', '取消')) &&
          !isLoading(form) ? form : null;
      }, timing.page);
      if (!form) return blocked('没有找到官网的添加成员弹窗。');
      const nameField = form.querySelector('input#basic_name');
      const certField = form.querySelector('input#basic_certNo');
      const confirm = find(form, 'button', '确定');
      const cancel = find(form, 'button', '取消');
      if (!nameField || !certField || !enabled(confirm) || !enabled(cancel)) {
        return blocked('官网表单结构已变化，请检查后再继续。');
      }
      fill(nameField, name);
      fill(certField, cert);
      const filled = await waitStable(() => dialog() === form && readTarget(false).id === orgId &&
        !isLoading(form) && enabled(confirm) && nameField.value === name && certField.value === cert &&
        ![...form.querySelectorAll('.ant-form-item-explain-error')].some(element => visible(element) && clean(element.textContent)),
      timing.page);
      if (!filled) return blocked('官网表单尚未准备好，已暂停并保留进度。');

      clicked = true;
      const result = await submitAndWait(form, confirm, () => {
        const current = readTarget(false);
        return location.hash.split('?')[0] !== memberRoute || (current.id && current.id !== orgId);
      }, (_, text) => classify(text));

      if (!result) return unknown('官网未给出可识别的处理结果，请先到成员列表核对。');
      if (['existing', 'rejected'].includes(result.status) && dialog() === form) {
        if (enabled(cancel)) cancel.click();
        const closed = await waitStable(() => !dialog(), timing.page);
        if (!closed) return {...result, pause: '请关闭官网的添加成员弹窗后继续。'};
      }
      return result;
    } catch {
      return clicked
        ? unknown('提交后读取官网结果时发生异常，请先核对。')
        : blocked('官网表单暂不可操作，请检查后再继续。');
    } finally {
      busy = false;
    }
  }

  const targetStatus = async () => {
    if (location.hash.split('?')[0] !== memberRoute) return {...readTarget(), busy};
    const ready = await waitStable(() => {
      const current = readTarget();
      return current.id ? current : null;
    }, timing.page);
    return {...(ready || readTarget()), busy};
  };
  const handle = message => {
    if (message.type === 'member-target') return targetStatus();
    if (message.type === 'member-submit') return submit(message);
    return null;
  };
  globalThis.__buaaMemberAdapter = {clean, visible, find, enabled, fill, wait, waitStable, isLoading, timing, submitAndWait, notices, classify, readGroup, handle};
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('index.html'))) return false;
    if (message.type === 'member-target' || message.type === 'member-submit') {
      handle(message).then(respond, () => respond({status: 'unknown', reason: '官网结果无法确认，请先核对。'}));
      return true;
    }
    return false;
  });
})();
