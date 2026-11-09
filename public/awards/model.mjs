export const verified = row => ['结果公示', '已公布结果', '官方报道确认', '部门确认获评'].includes(row.status);

const levelOrder = ['国家级', '市级', '区级', '校级'];
const awardGroups = [
  /项目大赛/,
  /十佳志愿者|十大明星志愿者|中国青年志愿者优秀个人奖/,
  /优秀志愿服务项目/,
  /优秀志愿服务团队/,
  /五星级志愿者/,
  /四星级志愿者|一至四星级志愿者/,
  /三星级志愿者/,
  /二星级志愿者/,
  /一星级志愿者/,
  /优秀志愿者$/
];
const medalOrder = ['金奖', '银奖', '铜奖'];
const byName = new Intl.Collator('zh-CN');

function priority(index, length) {
  return index === -1 ? length : index;
}

export function compareAwards(a, b) {
  const level = entry => priority(levelOrder.indexOf(entry.level), levelOrder.length);
  const group = entry => priority(awardGroups.findIndex(pattern => pattern.test(entry.award)), awardGroups.length);
  return level(a) - level(b) || group(a) - group(b) || byName.compare(a.award, b.award);
}

function compareRecords(a, b) {
  const medal = row => priority(medalOrder.findIndex(label => row.grade?.endsWith(label)), medalOrder.length);
  return (b.year || 0) - (a.year || 0) || compareAwards(a, b) || medal(a) - medal(b) || byName.compare(a.name, b.name);
}

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
  }).sort(compareRecords);
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
