(() => {
  if (globalThis.__buaaHoursAdapter) return;
  const {
    clean,
    visible,
    find,
    enabled,
    fill,
    wait,
    waitStable,
    isLoading,
    timing,
    submitAndWait,
    readGroup,
  } = globalThis.__buaaMemberAdapter;
  const { lookup, verifyName, displayedValue, sameTarget } =
    globalThis.__buaaActivityAdapter;
  const route = '#/projectActivityManage/myProject/durationInput';
  const result = (status, reason) => ({ status, reason });
  let busy = false;
  let proof = null;
  let lastNumber = '';
  function target() {
    const [page, query] = location.hash.split('?');
    const params = new URLSearchParams(query);
    const group = readGroup();
    if (
      page !== route ||
      !group ||
      !params.get('activityId') ||
      !params.get('postId') ||
      params.get('fromSettings') === '1' ||
      (params.get('orgId') && params.get('orgId') !== group.id) ||
      ![...document.querySelectorAll('.DurationInputList')].some(visible)
    ) {
      return { reason: '请打开目标活动岗位的「计时 → 时长录入」页面。' };
    }
    return {
      ...group,
      activityId: params.get('activityId'),
      postId: params.get('postId'),
    };
  }
  const changed = (expected) =>
    location.hash.split('?')[0] !== route ||
    (target().id && !sameTarget(target(), expected));
  const dialog = () =>
    [...document.querySelectorAll('.ant-modal, [role="dialog"]')]
      .filter(visible)
      .find((form) => form.querySelector('input[placeholder="请输入时长"]'));
  async function close(form) {
    const cancel = find(form, 'button', '取消');
    if (cancel && enabled(cancel)) cancel.click();
    return waitStable(
      () => !form.isConnected || !visible(form),
      timing.page,
      180,
    );
  }
  async function open(person, expected) {
    if (changed(expected)) throw Error('目标团体、活动或岗位已改变。');
    if (dialog()) throw Error('请先关闭官网的录时长弹窗。');
    const page = [...document.querySelectorAll('.DurationInputList')].find(
      visible,
    );
    if (!page) throw Error('请切到官网的「时长录入」页签。');
    const found = await lookup(page, person, expected, true, target);
    if (!found || found.changed)
      throw Error('官网人员检索尚未完成，请稍后继续。');
    if (found.total !== 1 || found.rows.length !== 1)
      throw Object.assign(Error('无法唯一匹配这个岗位中的志愿者。'), {personIssue:true});
    const row = found.rows[0];
    if (
      person.identifier === 'number' &&
      displayedValue(found.table, row, '志愿者编号') !== person.cert
    )
      throw Error('志愿者编号不一致。');
    if (!(await verifyName(row, person.name)))
      throw Object.assign(Error('姓名不一致，请核对名单。'), {personIssue:true});
    lastNumber = displayedValue(found.table, row, '志愿者编号');
    if (!lastNumber) throw Error('未能读取志愿者编号，请等待官网名单加载。');
    const actions = [...row.querySelectorAll('a,button')].filter(
      (el) => visible(el) && /^(录入|调整|计时)$/.test(clean(el.textContent)),
    );
    if (actions.length !== 1 || !found.unchanged())
      throw Error('无法确认这个人的录时长入口。');
    actions[0].click();
    const form = await waitStable(
      () => {
        const form = dialog();
        return form && !isLoading(form) && enabled(find(form, 'button', '确定'))
          ? form
          : null;
      },
      timing.page,
      300,
    );
    if (!form) throw Error('录时长表单仍在加载。');
    return form;
  }
  function dateControl(form) {
    const item = [...form.querySelectorAll('.ant-form-item')].find(
      (item) =>
        clean(item.querySelector('label')?.textContent).replace(
          /[：:*]/g,
          '',
        ).match(/^(?:服务)?日期$/),
    );
    return (
      item?.querySelector('.ant-select-selector') ||
      form.querySelector('.ant-select-selector')
    );
  }
  async function scanDates(form, wanted) {
    const control = dateControl(form);
    if (!control) throw Error('无法识别服务日期选择框。');
    control.click();
    const menu = await wait(
      () =>
        [...document.querySelectorAll('.ant-select-dropdown')]
          .filter(visible)
          .at(-1),
      timing.page,
    );
    if (!menu) throw Error('服务日期仍在加载。');
    const holder = menu.querySelector('.rc-virtual-list-holder');
    if (holder) {
      holder.scrollTop = 0;
      holder.dispatchEvent(new Event('scroll'));
    }
    const dates = new Map();
    for (let step = 0; step < 150; step++) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      for (const option of menu.querySelectorAll('.ant-select-item-option')) {
        const label = clean(option.getAttribute('title') || option.textContent);
        const date = label.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        if (!date) continue;
        const free =
          label === date &&
          !option.classList.contains('ant-select-item-option-disabled');
        dates.set(date, free);
        if (date === wanted) {
          if (!free) {
            document.body.dispatchEvent(
              new MouseEvent('mousedown', { bubbles: true }),
            );
            return { occupied: true };
          }
          option.click();
          return { selected: true };
        }
      }
      if (
        !holder ||
        holder.scrollTop + holder.clientHeight >= holder.scrollHeight - 1
      )
        break;
      holder.scrollTop += holder.clientHeight * 0.85;
      holder.dispatchEvent(new Event('scroll'));
    }
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    if (wanted) throw Error('这个服务日期不在官网可选范围内。');
    if (!dates.size) throw Error('没有读到可用的服务日期。');
    return {
      dates: [...dates].filter(([, free]) => free).map(([date]) => date),
    };
  }
  async function handle(message) {
    if (message.type === 'hours-target') return { ...target(), busy };
    if (message.type === 'hours-proof') {
      proof = message.proof;
      return { ok: true };
    }
    if (message.type?.startsWith('hours-batch-')) {
      if (busy) return result('blocked', '另一个计时操作正在处理。');
      busy = true;
      try { return await globalThis.__buaaHoursBatchAdapter.handle(message); }
      finally { busy = false; }
    }
    if (!['hours-prepare', 'hours-submit'].includes(message.type)) return null;
    if (busy) return result('blocked', '另一个计时操作正在处理。');
    busy = true;
    let form;
    let clicked = false;
    try {
      form = await open(message.person, message.target);
      const scanned = await scanDates(form, message.date);
      if (message.type === 'hours-prepare') {
        await close(form);
        return {...scanned, number: lastNumber};
      }
      if (scanned.occupied) {
        await close(form);
        return result('existing', '这一天已有记录，已避开');
      }
      const field = form.querySelector('input[placeholder="请输入时长"]');
      const notes = form.querySelector(
        'textarea[placeholder="请输入备注信息"]',
      );
      if (!(await waitStable(() => !isLoading(form), timing.page, 350)))
        throw Error('日期记录仍在加载。');
      if (
        field.value ||
        notes?.value ||
        form.querySelector('.ant-upload-list-item')
      ) {
        await close(form);
        return result('existing', '日期切换后发现已有记录，已避开');
      }
      if (
        !(
          message.hours >= 0.5 &&
          message.hours <= 8 &&
          (message.hours * 2) % 1 === 0
        ) ||
        !proof
      )
        throw Error('时长或证明图片有误。');
      fill(field, String(message.hours));
      if (notes) {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        ).set.call(notes, message.notes || '');
        notes.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const input = form.querySelector('input[type="file"]');
      if (!input) throw Error('无法识别官网的证明上传入口。');
      const binary = atob(proof.base64);
      const file = new File(
        [Uint8Array.from(binary, (c) => c.charCodeAt(0))],
        proof.name,
        { type: proof.type },
      );
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const uploaded = await waitStable(
        () =>
          form.querySelector('.ant-upload-list-item-done') &&
          !form.querySelector(
            '.ant-upload-list-item-uploading,.ant-upload-list-item-error',
          ) &&
          !isLoading(form),
        timing.submit,
        350,
      );
      if (!uploaded) throw Error('证明图片尚未上传成功，请检查后继续。');
      const confirm = find(form, 'button', '确定');
      if (
        changed(message.target) ||
        Number(field.value) !== message.hours ||
        !enabled(confirm)
      )
        throw Error('提交前核对未通过。');
      clicked = true;
      const recorded = await submitAndWait(
        form,
        confirm,
        () => changed(message.target),
        (element, text) => {
          if (
            element.querySelector('.ant-message-success') ||
            element.matches('.ant-message-success') ||
            /^(成功|操作成功|录入成功|保存成功)$/.test(text)
          )
            return result('added', '官网确认时长录入成功');
          return null;
        },
      );
      return (
        recorded ||
        result('unknown', '未能确认时长结果，请核对这个人的日期记录')
      );
    } catch (error) {
      if (!clicked && form) await close(form);
      return result(
        clicked ? 'unknown' : error.personIssue ? 'rejected' : 'blocked',
        error.message || '官网计时操作暂不可用',
      );
    } finally {
      busy = false;
    }
  }
  globalThis.__buaaHoursAdapter = { handle, target, changed, close, scanDates, getProof: () => proof };
  if (typeof chrome !== 'undefined' && chrome.runtime?.id)
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (
        sender.id !== chrome.runtime.id ||
        !sender.url?.startsWith(chrome.runtime.getURL('hours.html')) ||
        !message.type?.startsWith('hours-')
      )
        return false;
      handle(message).then(respond, () =>
        respond(result('unknown', '计时结果无法确认')),
      );
      return true;
    });
})();
