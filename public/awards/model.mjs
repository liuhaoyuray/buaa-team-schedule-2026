export const verified = row => ['结果公示', '已公布结果', '官方报道确认', '部门确认获评'].includes(row.status);

function matchesAward(row, award) {
  if (!award || row.award === award) return true;
  if (award === '海淀区一至四星级志愿者') return /^海淀区[一二三四]星级志愿者$/.test(row.award);
  return award === '中国青年志愿服务项目大赛' && row.award === '全国志愿服务项目大赛';
}

export function select(records, filters = {}) {
  const query = (filters.search || '').trim().toLowerCase();
  return records.filter(row => {
    if (filters.year && String(row.year ?? '未注明') !== filters.year) return false;
    if (filters.level && row.level !== filters.level) return false;
    if (filters.kind && row.kind !== filters.kind) return false;
    if (filters.unit && row.unit !== filters.unit) return false;
    if (!matchesAward(row, filters.award)) return false;
    if (filters.status === 'verified' && !verified(row)) return false;
    if (filters.status === 'pending' && verified(row)) return false;
    if (filters.status && !['verified', 'pending'].includes(filters.status) && row.status !== filters.status) return false;
    return !query || [row.name, row.unit, row.award, row.note, row.year, row.batch, row.leader, row.grade, row.honor]
      .join(' ').toLowerCase().includes(query);
  }).sort((a,b) => (b.year || 0) - (a.year || 0) || a.award.localeCompare(b.award,'zh') || a.name.localeCompare(b.name,'zh'));
}

export function groupUnits(records) {
  const units = new Map();
  for (const row of records) {
    const name = row.unit || '原资料未注明单位';
    if (!units.has(name)) units.set(name, {name,total:0,personal:0,projects:0,teams:0});
    const unit = units.get(name);
    unit.total++;
    unit[row.kind === '个人' ? 'personal' : row.kind === '项目' ? 'projects' : 'teams']++;
  }
  return [...units.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name,'zh'));
}
