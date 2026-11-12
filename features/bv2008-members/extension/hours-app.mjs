import { environment } from './environment.mjs';
import { readHourSheets, allocateHourDays, hourDates } from './hours-core.mjs';
import { batchKey } from './queue.mjs';
const root = environment.root;
const el = (id) => root.getElementById(id);
const status = (text) => {
  el('hours-status').textContent = text;
};
let refreshing = Promise.resolve(),
  refreshCount = 0;
let target = null,
  source = null,
  sheets = [],
  people = [],
  job = { days: {}, inFlight: null },
  jobKey = null,
  running = false,
  paused = false;
const send = environment.message;
for (const mode of ['member', 'activity', 'hours']) {
  const link = root.getElementById('mode-' + mode);
  const url = new URL(link.getAttribute('href'), location.href);
  if (environment.parameters.get('tab'))
    url.searchParams.set('tab', environment.parameters.get('tab'));
  link.href = url.href;
}
function completed(person) {
  return Object.values(job.days)
    .filter((day) => day.row === person.row && day.status === 'added')
    .reduce((sum, day) => sum + day.hours, 0);
}
function render() {
  const rows = people.map((person) => {
    const done = completed(person);
    const tr = document.createElement('tr');
    for (const text of [
      person.row,
      person.name,
      person.total,
      done,
      Math.max(0, (person.total || 0) - done),
      person.issue || '',
    ]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  });
  el('hours-results').replaceChildren(...rows);
  for (const id of [
    'hours-file',
    'hours-sheet',
    'hours-proof',
    'hours-start',
    'hours-end',
    'hours-order',
    'hours-notes',
    'hours-confirm',
    'hours-connect',
  ])
    el(id).disabled = running || refreshCount > 0;
  const uncertain = Object.entries(job.days).filter(
    ([, day]) => day.status === 'unknown',
  );
  el('hours-run').disabled =
    running ||
    refreshCount > 0 ||
    !target ||
    !people.length ||
    !el('hours-confirm').checked ||
    !!uncertain.length;
  el('hours-pause').disabled = !running || paused;
  el('hours-export').disabled = running || !people.length;
  el('hours-unknown').replaceChildren(
    ...uncertain.map(([key, day]) => {
      const item = document.createElement('p');
      item.append(
        '原表第 ' +
          day.row +
          ' 行 · ' +
          day.date +
          ' · ' +
          day.hours +
          ' 小时，结果待核对。 ',
      );
      for (const [label, state] of [
        ['官网确认已录入', 'added'],
        ['官网确认未录入', 'retry'],
      ]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.disabled = running;
        button.onclick = async () => {
          const current = await environment.readTarget('hours');
          if (!same(current, target)) {
            status('请回到原岗位后核对。');
            return;
          }
          await navigator.locks.request(
            'member-import-running',
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                status('当前有提交正在运行，请稍后再核对。');
                return;
              }
              const latest =
                (await environment.storage.get(jobKey))[jobKey] || job;
              if (state === 'added') latest.days[key].status = 'added';
              else delete latest.days[key];
              job = latest;
              await save();
              render();
            },
          );
        };
        item.append(button);
      }
      return item;
    }),
  );
}
const same = (a, b) =>
  a?.id === b?.id && a?.activityId === b?.activityId && a?.postId === b?.postId;
const save = () => environment.storage.set({ [jobKey]: job });
async function connect() {
  target = await environment.readTarget('hours');
  if (!target.id) target = null;
  el('hours-target').textContent = target
    ? '团体 · ' +
      target.name +
      ' ｜ 活动尾号 ' +
      target.activityId.slice(-8) +
      ' · 岗位尾号 ' +
      target.postId.slice(-8)
    : '请打开官网岗位的「计时 → 时长录入」，再点重新检查。';
  render();
}
async function loadProgress() {
  el('hours-confirm').checked = false;
  people = sheets[Number(el('hours-sheet').value)]?.read() || [];
  job = { days: {}, inFlight: null };
  jobKey = null;
  if (source && target) {
    jobKey = await batchKey(
      'hours:' + JSON.stringify([target.id, target.activityId, target.postId]),
      sheets[Number(el('hours-sheet').value)]?.name || '',
      source,
    );
    await navigator.locks.request(
      'member-import-running',
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error('另一个录入面板正在处理，请在那个面板继续。');
        const saved = (await environment.storage.get(jobKey))[jobKey];
        if (saved) {
          job = saved;
          if (job.inFlight) {
            job.days[job.inFlight.key] = { ...job.inFlight, status: 'unknown' };
            job.inFlight = null;
            await save();
          }
        }
      },
    );
  }
  render();
}
function refreshProgress() {
  el('hours-confirm').checked = false;
  refreshCount++;
  render();
  refreshing = refreshing
    .catch(() => {})
    .then(loadProgress)
    .finally(() => {
      refreshCount--;
      render();
    });
  return refreshing;
}
async function safely(action) {
  try {
    await action();
  } catch (error) {
    status(error.message || '操作失败，请检查输入。');
  }
  render();
}
el('hours-connect').onclick = () =>
  safely(async () => {
    await connect();
    await refreshProgress();
  });
el('hours-file').onchange = () =>
  safely(async () => {
    el('hours-confirm').checked = false;
    el('hours-run').disabled = true;
    const file = el('hours-file').files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw Error('名单最多 8 MB。');
    source = await file.arrayBuffer();
    sheets = await readHourSheets(
      source,
      environment.ExcelJS || globalThis.ExcelJS,
    );
    if (!sheets.length)
      throw Error('没有找到姓名、编号或证件号码、总时长这三列表头。');
    el('hours-sheet').replaceChildren(
      ...sheets.map((sheet, index) => new Option(sheet.name, index)),
    );
    await refreshProgress();
    status('名单已读取，请核对日期和证明图片。');
  });
for (const id of [
  'hours-sheet',
  'hours-start',
  'hours-end',
  'hours-order',
  'hours-notes',
  'hours-proof',
])
  el(id).onchange = () => safely(refreshProgress);
el('hours-confirm').onchange = render;
el('hours-pause').onclick = () => {
  paused = true;
  status('当前这次提交完成后暂停。');
  render();
};
el('hours-run').onclick = () =>
  safely(async () => {
    await refreshing;
    const file = el('hours-proof').files[0];
    if (
      !file ||
      file.size >= 3 * 1024 * 1024 ||
      !['image/png', 'image/jpeg'].includes(file.type)
    )
      throw Error('请选择小于 3 MB 的 PNG 或 JPG 证明图片。');
    hourDates([], el('hours-start').value, el('hours-end').value, false);
    if (!target || !jobKey || !el('hours-confirm').checked) return;
    running = true;
    paused = false;
    render();
    try {
      await navigator.locks.request(
        'member-import-running',
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw Error('另一个录入批次正在运行。');
          const current = await environment.readTarget('hours');
          if (!same(current, target)) throw Error('目标岗位已经改变。');
          const saved = (await environment.storage.get(jobKey))[jobKey];
          if (saved) job = saved;
          if (
            job.inFlight ||
            Object.values(job.days).some((day) => day.status === 'unknown')
          )
            throw Error('请先核对中断的提交结果。');
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await send({
            type: 'hours-proof',
            proof: { base64, name: file.name, type: file.type },
          });
          for (const person of people) {
            if (paused) break;
            if (person.issue) continue;
            let remaining = person.total - completed(person);
            if (remaining <= 0) continue;
            status('正在核对原表第 ' + person.row + ' 行的历史日期。');
            const prepared = await send({
              type: 'hours-prepare',
              person,
              target,
            });
            if (prepared.status === 'rejected') {
              person.issue = prepared.reason;
              render();
              continue;
            }
            if (!prepared.dates)
              throw Error(prepared.reason || '未能读取历史日期，已保留进度。');
            const dates = hourDates(
              prepared.dates,
              el('hours-start').value,
              el('hours-end').value,
              el('hours-order').value === 'desc',
            );
            const used = new Set(
              Object.values(job.days)
                .filter((day) => day.row === person.row)
                .map((day) => day.date),
            );
            while (remaining > 0 && !paused) {
              const next = allocateHourDays(person, remaining, dates, used)[0];
              if (!next) {
                person.issue =
                  '可用日期不足，剩余 ' + remaining + ' 小时待录入';
                break;
              }
              const date = next.date,
                amount = next.hours,
                key = person.row + '|' + date;
              const entry = { key, row: person.row, date, hours: amount };
              job.inFlight = entry;
              await save();
              status(
                '正在录入原表第 ' +
                  person.row +
                  ' 行 · ' +
                  date +
                  ' · ' +
                  amount +
                  ' 小时。',
              );
              let response;
              try {
                response = await send({
                  type: 'hours-submit',
                  person,
                  target,
                  date,
                  hours: amount,
                  notes: el('hours-notes').value,
                });
              } catch {
                response = {
                  status: 'unknown',
                  reason: '提交连接中断，请核对日期记录',
                };
              }
              if (!['added', 'existing', 'blocked'].includes(response?.status))
                response = { ...response, status: 'unknown' };
              if (response.status !== 'blocked')
                job.days[key] = { ...entry, ...response };
              job.inFlight = null;
              await save();
              render();
              if (['unknown', 'blocked'].includes(response.status))
                throw Error(response.reason);
              used.add(date);
              remaining = person.total - completed(person);
            }
          }
          status(
            paused
              ? '已暂停，进度已保存。'
              : '本轮处理结束，请检查待录时长与明细。',
          );
        },
      );
    } finally {
      running = false;
      render();
    }
  });
el('hours-export').onclick = () => {
  const cell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = [
    ['原表行号', '日期', '本次小时数', '状态', '说明'],
    ...Object.values(job.days).map((day) => [
      day.row,
      day.date,
      day.hours,
      day.status === 'added'
        ? '已录入'
        : day.status === 'existing'
          ? '已有记录，已避开'
          : '待核对',
      day.reason || '',
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    ),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = '时长录入明细.csv';
  (root.body || root).append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener(
  'beforeunload',
  (event) => {
    if (running) {
      event.preventDefault();
      event.returnValue = true;
    }
  },
  environment.signal ? { signal: environment.signal } : undefined,
);
safely(connect);
