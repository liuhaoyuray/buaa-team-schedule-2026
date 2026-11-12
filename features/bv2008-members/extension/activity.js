(() => {
  if (globalThis.__buaaActivityAdapter) return;
  const {clean, visible, find, enabled, fill, wait, waitStable, isLoading, timing, submitAndWait, classify, readGroup} = globalThis.__buaaMemberAdapter;
  const route = '#/projectActivityManage/myProject/recruitVolunteers';
  const addButton = () => find(document, 'button', '添加本团体成员');
  const activeDialog = () => [...document.querySelectorAll('[role="dialog"], .ant-modal')].find(visible);
  const dialog = () => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], .ant-modal')].filter(element =>
      visible(element) && (find(element, '.title-box', '添加成员') || find(element, '.ant-modal-title', '添加成员')) &&
      element.querySelector('input[placeholder="请输入志愿者编号"]'));
    return dialogs.find(element => !dialogs.some(other => other !== element && element.contains(other))) || null;
  };
  const blocked = reason => ({status: 'blocked', reason});
  const unknown = reason => ({status: 'unknown', reason});
  const rejected = reason => ({status: 'rejected', reason});
  const existing = () => ({status: 'existing', reason: '官网确认已在活动中'});
  const trim = text => String(text || '').trim().normalize('NFC');

  function readTarget(requireButton = true) {
    const [page, query] = location.hash.split('?');
    const params = new URLSearchParams(query);
    const group = readGroup();
    const activityId = params.get('activityId');
    const postId = params.get('postId');
    const validId = value => /^[\w-]{1,100}$/.test(value || '');
    if (page === route && group && validId(activityId) && validId(postId) &&
        params.get('hideActions') !== '1' && (!requireButton || addButton())) {
      return {...group, activityId, postId};
    }
    return {reason: '请在「我的活动」展开活动，进入对应岗位的「招募 → 已录用」，确认有「添加本团体成员」。'};
  }

  const sameTarget = (target, expected) => target.id === expected.id &&
    target.activityId === expected.activityId && target.postId === expected.postId;
  const resultRows = table => [...table.querySelectorAll('tbody tr[data-row-key]')].filter(visible);
  const totalRows = table => {
    const total = table.querySelector('.ant-pagination-total-text')?.textContent.match(/总共\s*(\d+)\s*条数据/);
    if (total) return Number(total[1]);
    return resultRows(table).length === 0 && table.querySelector('.ant-table-placeholder') ? 0 : null;
  };
  const signature = table => JSON.stringify([totalRows(table), resultRows(table).map(row => row.dataset.rowKey)]);

  function searchFields(scope) {
    const box = scope.querySelector('.search-box');
    const inputs = box && [...box.querySelectorAll('input')].filter(visible);
    const field = (...placeholders) => inputs?.find(input => placeholders.includes(input.placeholder));
    return {
      button: box && find(box, 'button', '检索'),
      name: field('请输入姓名'),
      number: field('请输入志愿者编号'),
      cert: field('请输入证件号码', '请输入证件号'),
      login: field('请输入用户名'),
      reset: box && find(box, 'button', '重置'),
    };
  }

  const targetChanged = expected => {
    const current = readTarget(false);
    return location.hash.split('?')[0] !== route || (current.id && !sameTarget(current, expected));
  };

  async function search(button, table, unchanged) {
    const previous = resultRows(table);
    let started = false;
    button.click();
    return waitStable(() => {
      if (!unchanged()) return {changed: true};
      if (isLoading(table)) {
        started = true;
        return null;
      }
      const rows = resultRows(table);
      const total = totalRows(table);
      if (total === null || (total === 0 && rows.length)) return null;
      // The counter resets before the response, while old rows remain.
      const replaced = rows.some(row => !previous.includes(row));
      if (!started && !replaced) return null;
      if (!started && total === 0) return null;
      return {rows, total, unchanged, table};
    }, timing.search, result => result.total === 0 ? 2000 : 500, () => signature(table));
  }

  async function lookup(scope, person, expected, reset, readContext = () => readTarget(false)) {
    const fields = searchFields(scope);
    const table = scope.querySelector('.table-box');
    const identifier = fields[person.identifier];
    if (!table || !fields.name || !identifier) return null;
    if (!await waitStable(() => !isLoading(table) && enabled(fields.button), timing.page, 700, () => signature(table))) return null;
    if (reset) {
      if (!await waitStable(() => enabled(fields.reset), timing.page)) return null;
      const cleared = await search(fields.reset, table, () => sameTarget(readContext(), expected));
      if (!cleared || cleared.changed) return null;
    }
    for (const field of [fields.number, fields.cert, fields.login]) {
      if (field && field !== identifier && field.value) fill(field, '');
    }
    fill(fields.name, person.name);
    fill(identifier, person.cert);
    const unchanged = () => sameTarget(readContext(), expected) &&
      fields.name.value === person.name && identifier.value === person.cert &&
      [fields.number, fields.cert, fields.login].every(field => !field || field === identifier || !field.value);
    if (!await waitStable(() => unchanged() && enabled(fields.button) && !isLoading(table), timing.page)) return null;
    return search(fields.button, table, unchanged);
  }

  async function verifyName(row, expected) {
    const table = row.closest('table');
    const headers = [...(table?.querySelectorAll('thead th') || [])];
    const index = headers.findIndex(header => clean(header.textContent) === '姓名');
    const cell = (index >= 0 ? row.cells[index] : row)?.querySelector('.phone-box');
    const name = cell?.querySelector('.text');
    if (!name) return false;
    const initial = trim(name.textContent);
    if (initial === trim(expected)) return true;
    // The duration and recruitment pages use opposite eye icon states.
    // Toggle the native name control, then compare the revealed full name.
    const reveal = cell.querySelector('img.icon[src*="eye1"],img.icon[src*="eye2"]');
    if (!reveal || !visible(reveal)) return false;
    const before = reveal.getAttribute('src');
    reveal.click();
    const updated = await wait(() => trim(name.textContent) !== initial ? {name: trim(name.textContent)} : null, timing.page);
    if (updated && reveal.isConnected && reveal.getAttribute('src') !== before) reveal.click();
    return updated?.name === trim(expected);
  }

  function displayedValue(table, row, ...labels) {
    const headers = [...table.querySelectorAll('thead th')];
    const index = headers.findIndex(header => labels.includes(clean(header.textContent)));
    return index < 0 ? '' : trim(row.cells[index]?.textContent);
  }

  function certificateMatches(table, row, cert) {
    const displayed = displayedValue(table, row, '证件号', '证件号码').toUpperCase();
    const value = cert.toUpperCase();
    if (displayed === value) return true;
    if (!/^[A-Z0-9]*[*＊•]+[A-Z0-9]*$/.test(displayed)) return false;
    const [prefix, suffix] = displayed.split(/[*＊•]+/);
    return prefix.length + suffix.length >= 4 && value.startsWith(prefix) && value.endsWith(suffix);
  }

  async function closeForm(form) {
    if (!form.isConnected || !visible(form)) return true;
    const cancel = find(form, 'button', '取消');
    if (!enabled(cancel)) return false;
    cancel.click();
    return !!await waitStable(() => !visible(form) || !form.isConnected, timing.page);
  }

  function readSubmitNotice(element, text) {
    if (/已经在本活动中|已在本活动中|已参加(?:本|该)活动|已(?:经)?在.{0,10}岗位/.test(text)) return existing();
    const recognized = classify(text);
    if (recognized?.status === 'rejected') return recognized;
    if (element.matches('.ant-message-success, .ant-notification-notice-success') ||
        element.querySelector('.ant-message-success, .ant-notification-notice-success') ||
        /^(成功|添加成功|添加成员成功|添加志愿者成功|操作成功)$/.test(text)) {
      return {status: 'added', reason: '官网提示添加成功'};
    }
    if (/不是.{0,10}团体成员|不属于.{0,10}团体|志愿者.{0,8}未实名/.test(text)) {
      return rejected('官网拒绝添加，请核对团体成员或实名状态');
    }
    return null;
  }

  async function settle(form, result) {
    return await closeForm(form) ? result : {...result, pause: '请关闭官网的添加成员弹窗后继续。'};
  }

  let busy = false;
  async function submit(person) {
    const expected = person.target;
    if (busy) return blocked('这个官网标签页正在处理另一条。');
    if (targetChanged(expected)) return blocked('团体、活动或岗位已经变化，请重新核对。');
    if (activeDialog()) return blocked('请先关闭官网已打开的弹窗。');
    let clicked = false;
    busy = true;
    try {
      const ready = await waitStable(() => {
        if (targetChanged(expected)) return {changed: true};
        const add = addButton();
        const page = add?.closest('.page-container');
        return page && sameTarget(readTarget(false), expected) && enabled(add) &&
          !isLoading(page) ? {add, page} : null;
      }, timing.page);
      if (!ready) return blocked('官网仍在加载，已保留进度。请等待加载结束后继续。');
      if (ready.changed) return blocked('团体、活动或岗位已经变化，请重新核对。');
      const {add, page} = ready;
      add.click();
      const form = await waitStable(() => {
        const form = dialog();
        return form && enabled(find(form, 'button', '检索')) && !isLoading(form) ? form : null;
      }, timing.page);
      if (!form) return blocked('没有找到「添加本团体成员」弹窗。');
      const match = await lookup(form, person, expected, false);
      if (!match || match.changed) return blocked('官网的团体成员检索结果无法确认，请检查后继续。');

      if (match.total === 0) {
        if (!await closeForm(form)) return blocked('请先关闭官网的添加成员弹窗。');
        const enrolled = await lookup(page, person, expected, true);
        if (!enrolled || enrolled.changed) return blocked('无法核对当前岗位的已录用名单，请检查后继续。');
        const row = enrolled.total === 1 && enrolled.rows.length === 1 ? enrolled.rows[0] : null;
        if (row && (person.identifier !== 'number' || displayedValue(enrolled.table, row, '志愿者编号') === person.cert) &&
            await verifyName(row, person.name)) return existing();
        return rejected('添加列表未匹配到此人，请核对团体成员身份或其他岗位的录用情况');
      }
      if (match.total !== 1 || match.rows.length !== 1) {
        return settle(form, rejected('官网检索到多条记录，请核对姓名和编号或证件号码'));
      }
      const row = match.rows[0];
      const idMatches = person.identifier !== 'cert' || certificateMatches(match.table, row, person.cert);
      if (!idMatches || !await verifyName(row, person.name)) {
        return settle(form, rejected('无法核对候选人的姓名或证件号码，请检查原表'));
      }
      const checkbox = row.querySelector('input[type="checkbox"]');
      const submitButton = find(form, 'button', '添加');
      if (!checkbox || checkbox.disabled || !submitButton || !match.unchanged() ||
          resultRows(match.table)[0] !== row || !row.isConnected) {
        return blocked('候选人、团体或岗位已变化，请检查后继续。');
      }
      if (!checkbox.checked) checkbox.click();
      const selected = await waitStable(() => {
        const selected = [...match.table.querySelectorAll('tbody input[type="checkbox"]:checked')];
        return match.unchanged() && !isLoading(form) && enabled(submitButton) &&
          selected.length === 1 && selected[0] === checkbox;
      }, timing.page);
      if (!selected) return blocked('官网仍在更新勾选状态，已暂停并保留进度。');

      clicked = true;
      const result = await submitAndWait(form, submitButton, () => targetChanged(expected), readSubmitNotice);
      if (!result) return unknown('未收到可确认的官网结果，请先到岗位的已录用名单核对。');
      if (['rejected', 'existing'].includes(result.status)) return settle(form, result);
      return result;
    } catch {
      return clicked ? unknown('提交后读取官网结果时发生异常，请先核对。')
        : blocked('官网检索或选择过程发生异常，请检查后继续。');
    } finally {
      busy = false;
    }
  }

  const targetStatus = async () => {
    if (location.hash.split('?')[0] !== route) return {...readTarget(), busy};
    const ready = await waitStable(() => {
      const current = readTarget();
      return current.id ? current : null;
    }, timing.page);
    return {...(ready || readTarget()), busy};
  };
  const handle = message => {
    if (message.type === 'activity-target') return targetStatus();
    if (message.type === 'activity-submit') return submit(message);
    return null;
  };
  globalThis.__buaaActivityAdapter = {handle, lookup, verifyName, displayedValue, sameTarget};
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('index.html'))) return false;
    if (message.type === 'activity-target' || message.type === 'activity-submit') {
      handle(message).then(respond, () => respond(unknown('官网结果无法确认，请先核对。')));
      return true;
    }
    return false;
  });
})();
