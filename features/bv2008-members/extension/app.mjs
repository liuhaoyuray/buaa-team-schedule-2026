import {batchKey, readPaste, readSheets, recoverJob, resultCsv, rowState, runQueue, statusLabels} from './queue.mjs';

import {environment} from './environment.mjs';

const get = id => environment.root.getElementById(id);
const parameters = environment.parameters;
const mode = parameters.get('mode') === 'activity' ? 'activity' : 'member';
const forActivity = mode === 'activity';
const sitePage = forActivity
  ? 'https://www.bv2008.cn/#/projectActivityManage/myProject/index'
  : 'https://www.bv2008.cn/#/volunteerManage/myMembers';
const labels = forActivity ? {...statusLabels, existing: '已在活动', rejected: '未添加'} : statusLabels;
const scope = target => target?.id && (forActivity
  ? 'activity:' + JSON.stringify([target.id, target.activityId, target.postId])
  : target.id);
const problemStates = new Set(['unknown', 'invalid', 'rejected']);
let target = null;
let source = null;
let batch = null;
let running = false;
let loading = false;
let pause = false;
let activeRow = null;
let reviewRow = null;

const notice = text => { get('notice').textContent = text; };
const mask = cert => cert.length > 7 ? cert.slice(0, 3) + '••••' + cert.slice(-4) : (cert ? '••••' : '—');
const message = environment.message;
const save = (key, job) => environment.storage.set({[key]: job});

for (const option of ['member', 'activity']) {
  const url = new URL(location.href);
  url.searchParams.set('mode', option);
  const link = get('mode-' + option);
  link.href = url.href;
  if (option === mode) link.setAttribute('aria-current', 'page');
}
const hoursLink = get('mode-hours');
if (hoursLink && environment.parameters.get('tab')) {
  const hoursUrl = new URL(hoursLink.href);
  hoursUrl.searchParams.set('tab', environment.parameters.get('tab'));
  hoursLink.href = hoursUrl.href;
}
if (forActivity) {
  document.title = '志愿北京 · 批量添加活动志愿者';
  get('mode-title').textContent = '批量添加活动志愿者';
  get('mode-description').textContent = '打开活动的一个岗位，从当前团体成员中匹配并添加名单里的志愿者。';
  get('target-title').textContent = '1. 核对活动与岗位';
  get('target-hint').textContent = '在官网打开「活动管理 → 我的活动」，展开目标活动，在对应岗位点「招募」。进入「已录用」后点扩展图标。';
  get('roster-hint').textContent = '请选择含「姓名」与「志愿者编号」或「证件号码」表头的 Excel。两列都有时优先使用志愿者编号。';
  get('paste-label').textContent = '粘贴名单，保留表头';
  get('confirm-label').textContent = '我已在官网核对团体、活动和岗位，并确认将名单添加到这个岗位。';
  get('retry').textContent = '重跑未添加项';
  get('existing-option').textContent = '已在活动';
  get('id-heading').textContent = '匹配依据';
  get('review-hint').textContent = '请先在目标岗位的「已录用」名单核对，再选下面对应的结果。';
}

async function withJob(key, action) {
  return navigator.locks.request(key, {ifAvailable: true}, async lock => {
    if (!lock) throw Error('这份名单正在另一个录入面板处理，请在那个面板继续。');
    const saved = (await environment.storage.get(key))[key];
    const job = recoverJob(saved);
    if (saved) await save(key, job);
    return action(job);
  });
}

function render() {
  const rows = batch?.rows || [];
  const counts = {};
  for (const row of rows) {
    const status = rowState(batch.job, row).status;
    counts[status] = (counts[status] || 0) + 1;
  }
  const locked = running || loading;
  const confirmed = get('confirm').checked && !!target;
  get('start').disabled = locked || !confirmed || !counts.pending || !!counts.unknown;
  get('retry').disabled = locked || !confirmed || !counts.rejected || !!counts.unknown;
  get('pause').disabled = !running || pause;
  get('download').disabled = locked || !rows.length;
  for (const id of ['workbook', 'sheet', 'paste', 'read-paste', 'confirm', 'connect']) get(id).disabled = locked;
  get('counts').textContent = rows.length
    ? ['共 ' + rows.length + ' 条', ...Object.entries(labels)
      .filter(([key]) => counts[key]).map(([key, label]) => label + ' ' + counts[key])].join(' · ')
    : '';
  const filter = get('filter').value;
  const rendered = [];
  for (const row of rows) {
    const {status, reason} = rowState(batch.job, row);
    if (filter === 'problem' ? !problemStates.has(status) : filter !== 'all' && filter !== status) continue;
    const tr = document.createElement('tr');
    tr.dataset.state = status;
    const idDisplay = forActivity && row.cert
      ? (row.identifier === 'number' ? '编号 ' : '证件 ') + mask(row.cert)
      : mask(row.cert);
    for (const value of [row.row, row.name || '—', idDisplay, activeRow === row.row ? '正在处理' : labels[status], reason || '—']) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    if (status === 'unknown') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '记录核对结果';
      button.disabled = locked || !target;
      button.addEventListener('click', () => {
        reviewRow = row.row;
        get('review-text').textContent = '原表第 ' + row.row + ' 行 · ' + row.name + ' · ' + mask(row.cert);
        get('review').returnValue = 'cancel';
        get('review').showModal();
      });
      tr.lastElementChild.append(' ', button);
    }
    rendered.push(tr);
  }
  get('results').replaceChildren(...rendered);
}

const readTarget = () => environment.readTarget(mode);

async function connect() {
  const current = await readTarget();
  const changed = scope(target) !== scope(current) || target?.name !== current.name;
  target = current.id ? current : null;
  get('target').textContent = target
    ? '当前团体 · ' + target.name + (forActivity
      ? ' ｜ 活动尾号 ' + target.activityId.slice(-8) + ' · 岗位尾号 ' + target.postId.slice(-8) : '')
    : current.reason;
  if (changed) {
    get('confirm').checked = false;
    batch = null;
  }
}

async function loadBatch() {
  batch = null;
  get('confirm').checked = false;
  if (!source) return;
  const rows = source.sheets ? source.sheets[Number(get('sheet').value)].read() : source.rows;
  if (!target) {
    batch = {rows, job: recoverJob()};
    notice('名单已读取。请先连接官网对应页面，再核对目标。');
    return;
  }
  const key = await batchKey(scope(target), source.sheets ? source.sheets[Number(get('sheet').value)].name : '', source.bytes);
  await withJob(key, job => { batch = {key, rows, job}; });
  notice(batch.rows.some(row => rowState(batch.job, row).status !== 'pending')
    ? '已读入名单。请检查预览里的异常与历史进度。' : '名单已读取，请核对后开始。');
}

async function load(action, {clearOnError = false} = {}) {
  if (loading || running) return;
  loading = true;
  render();
  try {
    await action();
  } catch (error) {
    if (clearOnError) batch = null;
    notice(error.message || '操作失败，请检查名单。');
  } finally {
    loading = false;
    render();
  }
}

get('connect').addEventListener('click', () => load(async () => {
  await connect();
  await loadBatch();
}, {clearOnError: true}));
get('go-site').addEventListener('click', () => environment.openTarget(sitePage));
get('workbook').addEventListener('change', () => load(async () => {
  source = null;
  get('sheet-label').hidden = true;
  const file = get('workbook').files[0];
  if (!file) return loadBatch();
  if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
    throw Error('请选择不超过 8 MB 的 .xlsx 文件。');
  }
  const bytes = await file.arrayBuffer();
  let sheets;
  try {
    sheets = await readSheets(bytes, environment.ExcelJS || globalThis.ExcelJS, mode);
  } catch (error) {
    throw Error(/没有找到/.test(error.message) ? error.message : '无法读取这份 Excel，请检查文件或改用粘贴。');
  }
  const selector = get('sheet');
  selector.replaceChildren(...sheets.map(({name}, index) => new Option(name, index)));
  get('sheet-label').hidden = sheets.length < 2;
  source = {sheets, bytes};
  get('paste').value = '';
  await loadBatch();
}, {clearOnError: true}));
get('sheet').addEventListener('change', () => load(loadBatch, {clearOnError: true}));
get('read-paste').addEventListener('click', () => load(async () => {
  source = null;
  get('workbook').value = '';
  get('sheet-label').hidden = true;
  const text = get('paste').value;
  const rows = readPaste(text, mode);
  source = {rows, bytes: new TextEncoder().encode(text.replace(/\r\n/g, '\n'))};
  get('paste').value = '';
  await loadBatch();
}, {clearOnError: true}));

async function run(retry) {
  if (running || loading || !batch?.key || !target || !get('confirm').checked) return;
  running = true;
  pause = false;
  render();
  try {
    await navigator.locks.request('member-import-running', {ifAvailable: true}, async lock => {
      if (!lock) throw Error('另一个录入面板正在添加成员，请先结束那批。');
      await runBatch(retry);
    });
  } catch (error) {
    get('confirm').checked = false;
    notice(error.message || '无法保存进度，已暂停。');
  } finally {
    running = false;
    activeRow = null;
    render();
  }
}

async function runBatch(retry) {
  await withJob(batch.key, async job => {
    batch.job = job;
    const current = await readTarget();
    if (scope(current) !== scope(target) || current.name !== target.name) {
      get('confirm').checked = false;
      notice('官网目标已变化，请重新检查并核对目标。');
      return;
    }
    if (current.busy) {
      notice('官网上一条提交还在处理中，请稍后再继续。');
      return;
    }
    notice('正在处理，官网加载较慢时会自动等待，请保持页面打开。');
    const result = await runQueue({
      job,
      rows: batch.rows,
      retry,
      save: updated => save(batch.key, updated),
      submit: row => message({type: mode + '-submit', orgId: target.id, target,
        name: row.name, cert: row.cert, identifier: row.identifier}),
      stopped: () => pause,
      update: row => { activeRow = row; render(); },
    });
    notice(result);
  });
}
get('start').addEventListener('click', () => run(false));
get('retry').addEventListener('click', () => run(true));
get('pause').addEventListener('click', () => {
  pause = true;
  notice('当前这条处理完成后暂停。');
  render();
});

get('review').addEventListener('close', () => {
  const decision = get('review').returnValue;
  const row = reviewRow;
  reviewRow = null;
  if (!['pending', 'added'].includes(decision) || row === null || !batch?.key) return;
  load(async () => {
    await withJob(batch.key, async job => {
      const current = await readTarget();
      if (scope(current) !== scope(target) || current.name !== target?.name || current.busy) {
        throw Error('请确认官网仍在原目标页面，且上一条提交已结束。');
      }
      if (job.results[row]?.status === 'unknown') {
        if (decision === 'pending') delete job.results[row];
        else job.results[row] = {status: 'added', reason: '管理员已在官网核对'};
        await save(batch.key, job);
      }
      batch.job = job;
      notice('已记录核对结果。可继续添加未处理的记录。');
    });
  });
});

get('download').addEventListener('click', () => {
  if (!batch) return;
  const url = URL.createObjectURL(new Blob([resultCsv(batch.job, batch.rows, labels)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = forActivity ? '志愿北京活动志愿者添加结果.csv' : '志愿北京成员添加结果.csv';
  (environment.root.body || environment.root).append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
get('confirm').addEventListener('change', render);
get('filter').addEventListener('change', render);
window.addEventListener('beforeunload', event => {
  if (!running) return;
  event.preventDefault();
  event.returnValue = true;
}, environment.signal ? {signal: environment.signal} : undefined);
load(connect);
