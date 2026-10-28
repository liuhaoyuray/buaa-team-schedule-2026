import { text, key, hours, validDate } from './core.mjs';

export const aliases = {
  name: ['姓名', '志愿者姓名', '学生姓名', '名字'],
  hours: ['拟录入时长', '待录入时长', '录入时长', '志愿时长', '志愿服务时长', '总时长', '服务时长', '时长', '献血量'],
  volunteerId: ['志愿者编号', '志愿北京编号', '志愿者号', '系统编号'],
  student: ['学号', '学生学号'], card: ['身份证号', '身份证号码', '证件号码', '身份证'],
  phone: ['联系方式', '联系电话', '手机号码', '手机号', '电话'],
  date: ['活动日期', '服务日期', '志愿日期', '日期']
};
export const scalar = value => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.formula || value.sharedFormula) return value.result ?? '';
    if (value.richText) return value.richText.map(t => t.text).join('');
    if (value.text) return value.text;
    return '';
  }
  return value ?? '';
};
const headerKey = value => key(scalar(value)).replace(/[（(].*?[）)]/g, '').replace(/[：:*＊]/g, '');
export function columnsAt(sheet, headerRow) {
  const fields = {};
  sheet.getRow(headerRow).eachCell((cell, col) => {
    const value = headerKey(cell.value);
    for (const [field, names] of Object.entries(aliases)) {
      if (!fields[field] && names.includes(value)) fields[field] = col;
    }
  });
  return fields;
}
export function guessHeader(sheet) {
  let best = { row: 1, fields: {}, score: -1 };
  for (let row = 1; row <= Math.min(30, sheet.rowCount); row++) {
    const fields = columnsAt(sheet, row), score = Object.keys(fields).length + (fields.name ? 5 : 0) + (fields.hours ? 3 : 0);
    if (score > best.score) best = { row, fields, score };
  }
  return best;
}
export async function loadWorkbook(buffer, ExcelJS) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  if (workbook.worksheets.reduce((n, s) => n + s.rowCount, 0) > 100000) throw Error('单份文件最多10万行，请拆分后上传。');
  return workbook;
}
function identifier(value, label) {
  value = scalar(value);
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error(label + '以超长数字保存，无法保证精度。请从系统重新下载，或将原始准确编号以文本保存。');
  return text(value);
}
export function readTemplate(workbook, filename, uid) {
  let found;
  for (const sheet of workbook.worksheets) {
    const guess = guessHeader(sheet), f = guess.fields;
    if (f.name && f.volunteerId && f.date && f.hours) { found = { sheet, ...guess }; break; }
  }
  if (!found) throw Error(filename + '：未找到同时含姓名、志愿者编号、日期、时长的模板表头。');
  const rows = [], ids = new Set(), { sheet, row: headerRow, fields } = found;
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const get = field => fields[field] ? scalar(sheet.getCell(row, fields[field]).value) : '';
    const name = text(get('name')), id = identifier(get('volunteerId'), filename + '第' + row + '行编号');
    if (!name && !id) continue;
    if (!name || !id) throw Error(filename + '第' + row + '行缺少姓名或志愿者编号，请检查模板。');
    if (ids.has(id)) throw Error(filename + '内编号重复：第' + row + '行。请先核对模板。');
    ids.add(id); rows.push({ row, name, id, student: text(get('student')), card: text(get('card')), phone: text(get('phone')) });
  }
  if (!rows.length) throw Error(filename + '没有人员记录。');
  return { uid, filename, label: filename.match(/^(\d+)[_\-]/)?.[1] || String(uid + 1), sheetName: sheet.name, headerRow, fields, rows, dates: [], override: '' };
}
export function readPeople(workbook, sheetName, headerRow, fields, filename) {
  const sheet = workbook.getWorksheet(sheetName), rows = [];
  if (!sheet || !Number.isInteger(headerRow) || headerRow < 1 || headerRow > sheet.rowCount) throw Error('人员清单表头行无效。');
  if (!fields.name || !fields.hours || fields.name === fields.hours) throw Error(filename + '请选择不同的姓名列和时长列。');
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const get = field => fields[field] ? scalar(sheet.getCell(row, Number(fields[field])).value) : '';
    if (!text(get('name')) && !text(get('hours'))) continue;
    const original = {};
    sheet.getRow(headerRow).eachCell((cell, col) => { original[text(scalar(cell.value)) || '列' + col] = text(scalar(sheet.getCell(row, col).value)); });
    const person = Object.fromEntries(['name','hours','volunteerId','student','card','phone'].map(field => [field, get(field)]));
    const issues = [];
    for (const field of ['volunteerId','student','card','phone']) {
      try { person[field] = identifier(person[field], field); }
      catch { person[field] = ''; issues.push(field + '原单元格为超长数值，精度待核，详见原始信息'); }
    }
    if (person.student && key(person.student) === key(person.card)) { person.student = ''; issues.push('原学号栏填为身份证号，学号未提供'); }
    rows.push({ ...person, rawHours: text(get('hours')), notes: issues.join('；'), original, source: filename + ' / ' + sheet.name + ' / 第' + row + '行' });
  }
  if (!rows.length) throw Error(filename + '所选工作表没有人员记录。');
  return rows;
}
export function dateValue(value) {
  value = scalar(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = text(value), m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|$|\s)/);
  const date = m ? m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0') : s;
  return validDate(date) ? date : '';
}
export function readHistory(workbook, filename) {
  const template = readTemplate(workbook, filename, 0), sheet = workbook.getWorksheet(template.sheetName), used = [];
  for (const r of template.rows) {
    const amount = hours(scalar(sheet.getCell(r.row, template.fields.hours).value));
    if (amount === null && text(scalar(sheet.getCell(r.row, template.fields.hours).value))) throw Error(filename + '第' + r.row + '行历史时长无法识别。');
    if (!(amount > 0)) continue;
    const date = dateValue(sheet.getCell(r.row, template.fields.date).value);
    if (!date) throw Error(filename + '第' + r.row + '行历史日期无法识别，请先更正。');
    used.push(r.id + '|' + date);
  }
  return used;
}
export async function exportTemplate(template, file, ExcelJS) {
  const workbook = await loadWorkbook(template.buffer, ExcelJS), sheet = workbook.getWorksheet(template.sheetName);
  const byRow = new Map(file.records.map(r => [r.row, r]));
  // Keep every original row, name, identifier, header and style; only replace dates and hours.
  for (const row of template.rows) {
    sheet.getCell(row.row, template.fields.date).value = file.date;
    sheet.getCell(row.row, template.fields.hours).value = byRow.get(row.row)?.hours ?? null;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const verify = await loadWorkbook(buffer, ExcelJS), output = verify.getWorksheet(template.sheetName);
  let sum = 0;
  for (const row of template.rows) {
    if (identifier(output.getCell(row.row, template.fields.volunteerId).value, '导出编号') !== row.id || text(scalar(output.getCell(row.row, template.fields.name).value)) !== row.name) throw Error('导出后姓名或编号发生变化，已中止。');
    const amount = scalar(output.getCell(row.row, template.fields.hours).value);
    if (amount !== '' && (!(amount > 0) || amount > 8)) throw Error('导出时长超出范围');
    if (dateValue(output.getCell(row.row, template.fields.date).value) !== file.date) throw Error('导出日期核对失败');
    sum += Number(amount || 0);
  }
  if (Math.round(sum * 10000) !== Math.round(file.hours * 10000)) throw Error('导出文件时长合计不一致');
  return buffer;
}
export async function reportWorkbook(result, ExcelJS) {
  const wb = new ExcelJS.Workbook();
  const headers = ['姓名','学号','身份证号','联系方式','名单中的总时长（小时）','本次已填入文件（小时）','尚未填入文件（小时）','未录入原因 / 匹配情况','模板志愿者编号','候选模板及编号','分配日期与时长','原始清单志愿者编号','资料来源','其他原始信息','备注'];
  function sheet(name, entries) {
    const ws = wb.addWorksheet(name); ws.addRow(headers);
    for (const e of entries) {
      const p = e.person;
      ws.addRow([p.name,p.student || '未提供',p.card || '未提供',p.phone || '未提供',p.hours ?? p.rawHours,e.prepared,e.pending,e.reason || '已匹配并生成导入文件',e.match?.id || '',e.candidates.map(c => `模板${c.label}：${c.id}`).join('；'),e.allocations.map(a => `模板${a.template} ${a.date} ${a.hours}h`).join('；'),p.volunteerId,p.sources.join('；'),JSON.stringify(p.originals || p.original),[p.notes,p.duplicateCount ? `重复登记${p.duplicateCount}条，按同一身份相同时长仅计一次` : '',text(p.rawHours) !== text(p.hours) ? `本次采用${p.hours ?? '待确认'}小时；原时长列为${p.rawHours}` : ''].filter(Boolean).join('；')]);
    }
    ws.columns.forEach((col, i) => { col.width = [16,20,25,20,22,22,22,48,28,65,65,28,75,90,65][i]; });
    for (const c of [2,3,4,9,10,12]) ws.getColumn(c).numFmt = '@';
    ws.eachRow((row, index) => { row.font = { name:'Microsoft YaHei', size:11 }; row.alignment = { vertical:'top',wrapText:true }; row.height = index === 1 ? 30 : 48; });
    ws.getRow(1).font = { name:'Microsoft YaHei',bold:true,size:11,color:{argb:'FFFFFFFF'} };
    ws.getRow(1).eachCell(c => { c.fill = { type:'pattern',pattern:'solid',fgColor:{argb:'FF24344F'} }; });
    ws.views = [{state:'frozen',ySplit:1}]; ws.autoFilter = {from:'A1',to:{row:1,column:headers.length}};
  }
  sheet('未匹配及待处理',result.entries.filter(e => e.reason || e.pending > 0));
  sheet('全部人员核对',result.entries);
  const summary = wb.addWorksheet('时长与导入顺序');
  summary.addRows([['项目','人数 / 文件数','时长（小时）'],['相同记录只计一次后的人数',result.entries.length,result.total],['本次已填入文件',result.entries.filter(e => e.prepared > 0).length,result.prepared],['尚未填入文件',result.entries.filter(e => e.reason || e.pending > 0).length,result.pending],['时长差额','',result.total-result.prepared-result.pending],['时长无法识别的人数',result.invalid,'须人工补正后核对'],[],['顺序','模板','日期','人数','时长','文件名']]);
  result.files.forEach((f,i) => summary.addRow([i+1,f.label,f.date,f.records.length,f.hours,f.name]));
  summary.columns=[{width:30},{width:22},{width:30},{width:16},{width:22},{width:95}];
  return wb.xlsx.writeBuffer();
}
