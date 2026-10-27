// Pure matching and allocation rules, shared by the browser and regression tests.
export const text = value => String(value ?? '').trim().normalize('NFKC');
export const key = value => text(value).replace(/\s/g, '');
export function hours(value) {
  const valid = n => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 10000)) && Math.round(n * 10000) / 10000 === n ? n : null;
  if (typeof value === 'number') return valid(value);
  const m = text(value).match(/^(\d+(?:\.\d+)?)\s*(?:h|小时|时)?$/i);
  return m ? valid(Number(m[1])) : null;
}
const units = n => Math.round(n * 10000);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function dateRange(start, end, direction = 'asc') {
  if (!validDate(start) || !validDate(end) || start > end) throw Error('请填写有效的起止日期，开始日期须不晚于结束日期。');
  const days = [];
  for (let d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
    if (days.length > 366) throw Error('单次日期范围最多366天。');
  }
  return direction === 'desc' ? days.reverse() : days;
}
export function customDates(value) {
  const dates = text(value).split(/[\s,，;；]+/).filter(Boolean);
  if (!dates.length || dates.some(d => !validDate(d)) || new Set(dates).size !== dates.length || dates.length > 366) throw Error('自定义日期请使用不重复的 YYYY-MM-DD，按录入先后排列。');
  return dates;
}
function identity(r) {
  return r.card ? 'card:' + key(r.card) : r.student ? 'student:' + key(r.student) : r.volunteerId ? 'vol:' + key(r.volunteerId) : '';
}
export function preparePeople(input) {
  const people = [], seen = new Map();
  for (const raw of input) {
    const r = { ...raw, name: text(raw.name), student: text(raw.student), card: text(raw.card), phone: text(raw.phone), volunteerId: text(raw.volunteerId), hours: hours(raw.hours), sources: [raw.source], duplicateCount: 0, originals: [raw.original] };
    const id = identity(r);
    // Names alone never prove that two source records belong to the same person.
    const previous = id && seen.get(id);
    if (previous && previous.name === r.name && r.hours !== null && previous.hours === r.hours) {
      previous.sources.push(raw.source); previous.originals.push(raw.original); previous.duplicateCount++; continue;
    }
    if (previous) { previous.sourceConflict = true; r.sourceConflict = true; }
    else if (id) seen.set(id, r);
    r.uid = String(people.length); people.push(r);
  }
  return people;
}
export function candidatesFor(person, templates) {
  const byId = new Map();
  for (const template of templates) for (const row of template.rows) {
    if (key(row.name) !== key(person.name)) continue;
    // One system identity in several groups belongs to the first selected template.
    if (!byId.has(row.id)) byId.set(row.id, { ...row, template: template.uid, label: template.label });
  }
  return [...byId.values()];
}
export function plan(people, templates, used = new Set(), choices = {}, edits = {}) {
  const entries = people.map(original => {
    const person = { ...original, hours: Object.hasOwn(edits, original.uid) ? hours(edits[original.uid]) : original.hours };
    const candidates = candidatesFor(person, templates);
    let match = null, reason = '';
    if (!person.name) reason = '缺少姓名';
    else if (person.hours === null || person.hours <= 0 || units(person.hours) / 10000 !== person.hours) reason = '时长须为正数，最多4位小数；请手动核对';
    else if (person.sourceConflict) reason = '同一身份的姓名或时长不一致，需核对原名单后重新上传';
    else if (choices[person.uid] === 'skip') reason = '手动暂不录入';
    else if (choices[person.uid]) {
      match = candidates.find(c => c.id === choices[person.uid]);
      if (!match) reason = '手动选择已失效，请重新选择';
    } else if (candidates.length === 1) match = candidates[0];
    else if (candidates.length > 1) {
      // Only a unique exact identity is sufficient to resolve a duplicate name.
      const fields = ['volunteerId', 'card', 'student', 'phone'];
      const hits = new Set();
      for (const field of fields) {
        if (!person[field]) continue;
        const found = candidates.filter(c => key(field === 'volunteerId' ? c.id : c[field]) === key(person[field]));
        if (found.length === 1) hits.add(found[0]);
      }
      if (hits.size === 1) match = [...hits][0];
      else reason = hits.size > 1 ? '重名身份信息冲突，请手动确认' : '重名，须确认志愿者编号';
    } else reason = '所有模板均未找到同名人员';
    return { person, candidates, match, reason, allocations: [], prepared: 0, pending: person.hours ?? 0 };
  });
  const matchedIds = new Map();
  for (const entry of entries) if (entry.match) {
    const list = matchedIds.get(entry.match.id) || []; list.push(entry); matchedIds.set(entry.match.id, list);
  }
  for (const list of matchedIds.values()) if (list.length > 1) for (const e of list) { e.match = null; e.reason = '多条名单对应同一系统编号，需区分身份或去重'; }
  const files = [];
  for (const template of templates) {
    if (!template.dates?.length) throw Error('模板 ' + template.label + ' 尚未设置日期');
    if (new Set(template.dates).size !== template.dates.length) throw Error('同一模板不能出现重复日期');
    for (const date of template.dates) {
      if (!validDate(date)) throw Error('模板日期无效');
      const records = [];
      for (const entry of entries) {
        if (!entry.match || entry.match.template !== template.uid || entry.pending <= 0) continue;
        if (used.has(entry.match.id + '|' + date)) continue;
        const amount = Math.min(80000, units(entry.pending)) / 10000;
        if (amount <= 0) continue;
        records.push({ ...entry.match, hours: amount, personUid: entry.person.uid });
        entry.allocations.push({ template: template.label, date, hours: amount });
        entry.prepared = (units(entry.prepared) + units(amount)) / 10000;
        entry.pending = (units(entry.pending) - units(amount)) / 10000;
      }
      if (records.length) files.push({ template: template.uid, label: template.label, date, records, hours: records.reduce((sum, r) => sum + units(r.hours), 0) / 10000 });
    }
  }
  for (const entry of entries) if (entry.match && entry.pending > 0) entry.reason = '可用日期不足或已用日期冲突，剩余时长待录入';
  const sum = field => entries.reduce((n, e) => n + units(e[field]), 0) / 10000;
  const total = entries.reduce((n, e) => n + units(e.person.hours ?? 0), 0) / 10000;
  if (units(total) !== units(sum('prepared')) + units(sum('pending'))) throw Error('时长核对未通过');
  return { entries, files, total, prepared: sum('prepared'), pending: sum('pending'), invalid: entries.filter(e => e.person.hours === null).length };
}
