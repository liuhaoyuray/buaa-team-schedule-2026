import {aliases, columnsAt, loadWorkbook, scalar} from './shared/io.mjs';

export const statusLabels = {
  pending: '待处理', invalid: '资料有误', added: '已添加',
  existing: '已是成员', rejected: '官网拒绝', unknown: '待核对',
};

const maxRows = 500;
const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const tidy = value => String(value ?? '').trim();

export function checkPerson(nameValue, certValue) {
  const name = tidy(nameValue);
  const cert = tidy(certValue).replaceAll('x', 'X');
  let issue = '';
  if (!name || !cert) issue = '缺少姓名或证件号码';
  else if (name.length > 20 || cert.length > 20) issue = '姓名或证件号码超过官网允许的长度';
  else if (typeof certValue === 'number' && (!Number.isSafeInteger(certValue) || cert.length > 15)) {
    issue = 'Excel 将证件号保存成了长数字，请从原始资料按文本修正';
  } else if (/\s/.test(cert) || /^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(cert)) {
    issue = '证件号码含空白或科学计数法，请核对原始资料';
  } else if (/^\d{17}[\dX]$/.test(cert)) {
    const check = weights.reduce((sum, weight, index) => sum + weight * Number(cert[index]), 0);
    if (cert[17] !== '10X98765432'[check % 11]) issue = '居民身份证校验位不符';
  }
  return {name, cert, issue};
}

export function prepareRows(values, mode = 'member') {
  const seen = new Set();
  const rows = [];
  for (const [row, name, cert, number] of values) {
    if (!tidy(name) && !tidy(cert) && !tidy(number)) continue;
    if (rows.length >= maxRows) throw Error('一批最多 500 条，请按名单拆分后处理。');
    const useNumber = mode === 'activity' && !!tidy(number);
    const identifier = useNumber ? 'number' : 'cert';
    const person = useNumber ? checkNumber(name, number) : checkPerson(name, cert);
    const key = identifier + ':' + person.cert;
    if (!person.issue && seen.has(key)) person.issue = useNumber
      ? '名单中已有相同志愿者编号' : '名单中已有相同证件号码';
    if (!person.issue) seen.add(key);
    rows.push({row, ...person, identifier});
  }
  if (!rows.length) throw Error('没有读到人员。');
  return rows;
}

function checkNumber(nameValue, numberValue) {
  const name = tidy(nameValue);
  const cert = tidy(numberValue);
  let issue = '';
  if (!name) issue = '缺少姓名';
  else if (name.length > 20) issue = '姓名超过官网允许的长度';
  else if (typeof numberValue === 'number' && (!Number.isSafeInteger(numberValue) || cert.length > 15)) {
    issue = 'Excel 将志愿者编号保存成了长数字，请从原始资料按文本修正';
  } else if (!/^[A-Za-z0-9-]{1,20}$/.test(cert) || /^\d+[eE]\d+$/.test(cert)) {
    issue = '志愿者编号格式不正确，请使用平台上的完整编号';
  }
  return {name, cert, issue};
}

export function readPaste(value, mode = 'member') {
  if (value.length > 200000) throw Error('粘贴内容过大，请拆成多批。');
  const rows = value.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.split('\t'));
  const first = rows.findIndex(cells => cells.some(tidy));
  if (first < 0) throw Error('请从 Excel 复制姓名和证件号码两列。');
  const header = rows[first].map(tidy);
  let name = header.findIndex(label => aliases.name.includes(label));
  let cert = header.findIndex(label => aliases.card.includes(label));
  const number = mode === 'activity' ? header.findIndex(label => aliases.volunteerId.includes(label)) : -1;
  const hasHeader = name !== -1 && (cert !== -1 || number !== -1);
  if (!hasHeader) {
    if (mode === 'activity') throw Error('请连同「姓名」和「志愿者编号」或「证件号码」表头一起复制。');
    if (rows.some(cells => cells.some(tidy) && cells.length !== 2)) {
      throw Error('请复制相邻的姓名和证件号码两列，或保留两列的表头。');
    }
    [name, cert] = [0, 1];
  }
  return prepareRows(rows.slice(first + Number(hasHeader))
    .map((cells, index) => [first + Number(hasHeader) + index + 1, cells[name], cells[cert], cells[number]]), mode);
}

export async function readSheets(buffer, ExcelJS, mode = 'member') {
  const workbook = await loadWorkbook(buffer, ExcelJS);
  const sheets = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== 'visible') continue;
    for (let row = 1; row <= Math.min(sheet.rowCount, 30); row++) {
      const columns = columnsAt(sheet, row);
      if (!columns.name || !(columns.card || (mode === 'activity' && columns.volunteerId))) continue;
      sheets.push({
        name: sheet.name,
        read: () => {
          const values = [];
          for (let index = row + 1; index <= sheet.rowCount; index++) {
            const read = column => column ? scalar(sheet.getCell(index, column).value) : '';
            values.push([index, read(columns.name), read(columns.card),
              mode === 'activity' ? read(columns.volunteerId) : '']);
          }
          return prepareRows(values, mode);
        },
      });
      break;
    }
  }
  if (!sheets.length) throw Error(mode === 'activity'
    ? '没有找到名单表头。请保留「姓名」和「志愿者编号」或「证件号码」。'
    : '没有找到姓名和证件号码列，请保留这两列表头。');
  return sheets;
}

export async function batchKey(orgId, sheet, bytes) {
  const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const encode = value => new TextEncoder().encode(value);
  return 'members:' + await digest(encode(JSON.stringify([orgId, sheet, await digest(bytes)])));
}

export function rowState(job, row) {
  return job.results[row.row] || (row.issue
    ? {status: 'invalid', reason: row.issue}
    : {status: 'pending', reason: ''});
}

export function recoverJob(saved) {
  const job = saved || {results: {}, inFlight: null};
  if (job.inFlight !== null) {
    job.results[job.inFlight] = {status: 'unknown', reason: '上次提交时中断，请先到官网核对'};
    job.inFlight = null;
  }
  return job;
}

export async function runQueue({job, rows, retry, save, submit, stopped, update}) {
  if (rows.some(row => rowState(job, row).status === 'unknown')) return '请先核对「待核对」的记录。';
  const expected = retry ? 'rejected' : 'pending';
  for (const row of rows) {
    if (stopped()) return '已暂停，进度已保留。';
    if (row.issue || rowState(job, row).status !== expected) continue;
    job.inFlight = row.row;
    await save(job);
    update(row.row);
    let result;
    try {
      result = await submit(row);
    } catch {
      result = {status: 'unknown', reason: '与官网标签页的连接中断，请先核对结果'};
    }
    if (!['added', 'existing', 'rejected', 'unknown', 'blocked'].includes(result?.status)) {
      result = {status: 'unknown', reason: '未能确认官网处理结果，请先核对'};
    }
    if (result.status !== 'blocked') job.results[row.row] = result;
    job.inFlight = null;
    await save(job);
    update(null);
    if (result.pause) return result.pause;
    if (result.status === 'unknown' || result.status === 'blocked') return result.reason;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return '本轮处理结束。可查看或下载结果。';
}

export function resultCsv(job, rows, labels = statusLabels) {
  const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
  return '\uFEFF' + [['原表行号', '处理结果', '原因'], ...rows.map(row => {
    const {status, reason} = rowState(job, row);
    return [row.row, labels[status], reason];
  })].map(row => row.map(cell).join(',')).join('\r\n');
}
