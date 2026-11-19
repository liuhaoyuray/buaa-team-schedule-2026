import {compareAwards, normalizeRecord, personalProfileCounts, samePersonalName, select, verified, groupUnits} from './model.mjs';

const $ = id => document.getElementById(id);
if (parent !== window) document.documentElement.dataset.embedded = 'true';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const link = (url, title) => url && /^https:\/\//.test(url)
  ? '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">' + escape(title) + ' ↗</a>'
  : escape(title);

const fiveStar = '北京市五星级志愿者';
const fields = ['year', 'kind', 'award', 'unit', 'status', 'search', 'profile'];
const pageSize = 25;
let data, rows = [], page = 1, tab = 'list';
const filters = () => Object.fromEntries(fields.map(id => [id, $(id).value]));
const currentYear = r => r.year ?? '未注明';

function fill(id, values) {
  for (const value of values) $(id).add(new Option(value, value));
}

function height() {
  if (parent !== window) parent.postMessage({
    type: 'awards-height',
    height: Math.ceil(document.documentElement.getBoundingClientRect().height)
  }, location.origin);
}

function changeTab(next) {
  tab = next;
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.tabview').forEach(view => view.hidden = view.id !== tab);
  $('queryControls').hidden = !['list', 'units'].includes(tab);
  render();
}

function renderFiveYears() {
  const panel = $('fiveYears');
  panel.hidden = tab !== 'list' || $('award').value !== fiveStar;
  if (panel.hidden) return;
  const starRows = select(data.records, {award: fiveStar});
  const years = [...new Set(starRows.map(currentYear))];
  panel.innerHTML = years.map(year => {
    const batch = starRows.filter(row => currentYear(row) === year);
    const confirmed = batch.filter(verified).length;
    const reported = data.fiveStarBatches?.[year];
    const summary = reported
      ? reported.recognized + ' 人获评'
      : [confirmed && confirmed + ' 人获评', batch.length > confirmed && (batch.length - confirmed) + ' 人待核结果'].filter(Boolean).join(' · ');
    return '<button type="button" data-year="' + escape(year) + '" aria-pressed="' +
      (String(year) === $('year').value) + '"><strong>' + escape(year) +
      (typeof year === 'number' ? ' 年' : '') + '</strong><span>' +
      escape(batch[0].batch || '') + ' · ' + escape(summary) + '</span></button>';
  }).join('');
  const year = $('year').value;
  const reported = data.fiveStarBatches?.[year || '2026'];
  if (reported?.note) {
    $('notice').textContent = reported.note;
    $('notice').hidden = false;
  }
}

function render() {
  const selection = filters();
  const matched = select(data.records, selection);
  rows = tab === 'units' ? matched.filter(verified) : matched;
  page = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  document.querySelectorAll('[data-award]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.award === selection.award)));
  $('listTitle').textContent = selection.award || '荣誉名单';
  const pending = rows.filter(row => !verified(row)).length;
  $('count').textContent = '共 ' + rows.length.toLocaleString() + ' 条' + (pending ? '，其中 ' + pending + ' 条为推荐、候选或待核对' : '');
  $('notice').textContent = '';
  $('notice').hidden = true;
  $('export').disabled = !rows.length;
  const profile = personalProfileCounts(select(data.records, {
    ...selection, kind: '个人', profile: '', status: tab === 'units' ? 'verified' : selection.status
  }));
  $('profileSummary').hidden = !profile.total || !['list', 'units'].includes(tab) ||
    (selection.kind && selection.kind !== '个人');
  $('profileSummary').innerHTML = [
    ['', '个人记录', profile.total],
    ['missingStudentId', '缺学号', profile.missingStudentId],
    ['missingCollege', '缺学院', profile.missingCollege]
  ].map(([value,label,count]) => '<button type="button" data-profile="' + value +
    '" aria-pressed="' + (selection.kind === '个人' && selection.profile === value) +
    '"><span>' + label + '</span><strong>' + count.toLocaleString() + '</strong></button>').join('');
  $('rows').innerHTML = rows.slice((page - 1) * pageSize, page * pageSize).map(row =>
    '<tr class="award-row"><td data-label="年度">' + escape(currentYear(row)) +
    (row.batch ? '<span class="sub">' + escape(row.batch) + '</span>' : '') +
    '</td><td data-label="姓名 / 项目 / 团队"><strong>' + escape(row.name) + '</strong><span class="sub">' + escape(row.kind) +
    (row.leader ? ' · 负责人 ' + escape(row.leader) : '') +
    '</span></td><td data-label="学号" class="student-id' + (row.kind === '个人' && !row.studentIdNotApplicable ? '' : ' not-applicable') + '">' +
    (row.studentId ? escape(row.studentId) : row.studentIdNotApplicable ? '不适用' : row.kind === '个人' ? '<span class="missing-value">待补学号</span>' : '—') +
    '</td><td data-label="' + (row.kind === '个人' && !row.studentIdNotApplicable ? '学院' : '所属单位') + '">' +
    (row.unit ? escape(row.unit) : '<span class="missing-value">' + (row.kind === '个人' ? '学院待补充' : '单位待补充') + '</span>') +
    '</td><td data-label="奖项">' + escape(row.award) +
    (row.grade || row.honor ? '<span class="sub">' + escape(row.grade || row.honor) + '</span>' : '') +
    '</td><td data-label="名单状态"><span class="badge ' + (verified(row) ? '' : 'pending') + '">' +
    escape(row.status) + '</span></td><td data-label="详情"><button class="text-button" data-detail="' +
    escape(row.id) + '">详情 ↗</button></td></tr>'
  ).join('') || '<tr><td colspan="7" class="empty">当前筛选没有记录。可以切换年度或清空筛选。</td></tr>';

  $('pageInfo').textContent = '第 ' + page + ' / ' + Math.max(1, Math.ceil(rows.length / pageSize)) + ' 页';
  $('prev').disabled = page === 1;
  $('next').disabled = page * pageSize >= rows.length;
  if (tab === 'units') {
    $('unitRows').innerHTML = groupUnits(rows).map(unit =>
      '<tr><td>' + escape(unit.name) + '</td><td>' + unit.personal + '</td><td>' +
      unit.projects + '</td><td>' + unit.teams + '</td><td>' + unit.total + '</td></tr>'
    ).join('') || '<tr><td colspan="5" class="empty">当前筛选没有获评或结果公示记录。</td></tr>';
  }
  renderFiveYears();
  height();
}

function detail(id) {
  const row = data.records.find(record => record.id === id);
  const source = data.sources.find(item => item.id === row.source);
  const studentSource = data.sources.find(item => item.id === row.studentIdSource);
  const collegeSource = data.sources.find(item => item.id === row.unitSource);
  const related = data.records.filter(record => record.id !== id &&
    (row.kind === '个人' ? samePersonalName(record, row) : record.kind === row.kind && record.name === row.name));
  const details = [
    ['学号', row.kind === '个人' ? row.studentId || (row.studentIdNotApplicable ? '不适用' : '待补充') : ''],
    [row.kind === '个人' && !row.studentIdNotApplicable ? '学院 / 书院' : '所属单位', row.unit || '待补充'],
    ['原登记单位', row.originalUnit], ['年度', currentYear(row)], ['奖项', row.award], ['批次', row.batch],
    ['获奖等次', row.grade], ['获奖称号', row.honor], ['对象', row.kind],
    ['项目负责人', row.kind === '项目' ? row.leader || '待补负责人资料' : ''],
    ['名单状态', row.status], ['发布日期', row.published], ['补充信息', row.note]
  ].filter(([,value]) => value);
  $('detailBody').innerHTML = '<h2>' + escape(row.name) + '</h2><dl>' +
    details.map(([label,value]) => '<dt>' + label + '</dt><dd>' + escape(value) + '</dd>').join('') +
    '<dt>来源</dt><dd>' + link(source.url, source.title) + '<span class="sub">' +
    escape(row.locator) + '</span></dd>' +
    (studentSource ? '<dt>学号依据</dt><dd>' + escape(studentSource.title) + '<span class="sub">' +
      escape(row.studentIdLocator) + ' · ' + escape(row.studentIdMatch) + '</span></dd>' : '') +
    (collegeSource ? '<dt>单位依据</dt><dd>' + link(collegeSource.url, collegeSource.title) + '<span class="sub">' +
      escape(row.unitLocator) + ' · ' + escape(row.unitMatch) + '</span></dd>' : '') +
    (row.leaderSource ? '<dt>负责人依据</dt><dd>' + link(row.leaderUrl, row.leaderSource) + '</dd>' : '') +
    (row.extraUrl ? '<dt>补充资料</dt><dd>' + link(row.extraUrl, '查看原文') + '</dd>' : '') + '</dl>' +
    (related.length ? '<div class="related"><strong>同名记录</strong>' +
      related.map(item => '<div>' + escape(currentYear(item)) + ' · ' + escape(item.award) +
        ' · ' + escape(item.unit || '单位未注明') +
        (item.studentId ? ' · 学号 ' + escape(item.studentId) : '') + '</div>').join('') + '</div>' : '');
  const dialog = $('detail');
  const frame = window.frameElement;
  const bounds = frame?.getBoundingClientRect();
  const viewportHeight = frame ? parent.innerHeight : innerHeight;
  dialog.style.maxHeight = Math.floor(viewportHeight * .82) + 'px';
  dialog.showModal();
  if (bounds) {
    const visibleTop = Math.max(0, -bounds.top);
    const visibleBottom = Math.min(innerHeight, viewportHeight - bounds.top);
    const offset = Math.max(12, (visibleBottom - visibleTop - dialog.offsetHeight) / 2);
    dialog.style.margin = '0 auto';
    dialog.style.bottom = 'auto';
    dialog.style.top = (visibleTop + offset) + 'px';
  }
}

async function exportExcel() {
  const button = $('export');
  const records = rows;
  const includeGrade = records.some(row => row.grade);
    const includeHonor = records.some(row => row.honor);
  const includeBatch = records.some(row => row.batch);
  const includeStudentId = records.some(row => row.kind === '个人');
    const includeLeader = records.some(row => row.kind === '项目');
  button.disabled = true;
  button.textContent = '正在生成…';
  try {
    if (!window.ExcelJS) throw Error('Excel 组件加载失败，请刷新后重试');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '北航志工部、实践部工作台';
    const sheet = workbook.addWorksheet('荣誉明细');
    const columns = [
      ['年度',12, row => row.year], ['姓名 / 项目 / 团队',35,row => row.name],
      ...(includeStudentId ? [['学号',18,row => row.studentId || (row.studentIdNotApplicable ? '不适用' : '')]] : []),
      ['学院 / 所属单位',30,row => row.unit], ['原登记单位',30,row => row.originalUnit], ['奖项',42,row => row.award],
      ...(includeGrade ? [['获奖等次',18,row => row.grade]] : []),
      ...(includeHonor ? [['获奖称号',18,row => row.honor]] : []),
      ...(includeBatch ? [['批次',14,row => row.batch]] : []),
      ...(includeLeader ? [['项目负责人',22,row => row.leader], ['负责人依据',60,row => row.leaderSource]] : []),
      ['对象',12,row => row.kind], ['名单状态',22,row => row.status],
      ['发布日期',16,row => row.published], ['补充信息',65,row => row.note],
      ['来源名称',58,(_,source) => source.title], ['来源链接',55,(_,source) => source.url],
      ['原件定位',30,row => row.locator], ['补充链接',55,row => row.extraUrl],
      ...(includeStudentId ? [
        ['学号来源',52,row => data.sources.find(source => source.id === row.studentIdSource)?.title],
        ['学号原件定位',65,row => row.studentIdLocator],
        ['学号核对方式',48,row => row.studentIdMatch],
        ['学院来源',52,row => data.sources.find(source => source.id === row.unitSource)?.title],
        ['学院原件定位',65,row => row.unitLocator]
      ] : [])
    ];
    sheet.addRow(columns.map(([label]) => label));
    sheet.columns.forEach((column,index) => column.width = columns[index][1]);
    for (const row of records) {
      const source = data.sources.find(item => item.id === row.source);
      sheet.addRow(columns.map(([, ,value]) => value(row, source)));
    }
    sheet.views = [{state:'frozen',ySplit:1,xSplit:2}];
    sheet.autoFilter = {from:{row:1,column:1},to:{row:sheet.rowCount,column:columns.length}};
    const units = workbook.addWorksheet('单位汇总');
    units.addRow(['学院 / 所属单位', '个人荣誉人次', '项目荣誉项次', '团队荣誉项次', '合计条数']);
    for (const unit of groupUnits(records.filter(verified))) {
      units.addRow([unit.name, unit.personal, unit.projects, unit.teams, unit.total]);
    }
    units.columns.forEach((column,index) => column.width = index ? 20 : 40);
    const notes = workbook.addWorksheet('使用说明');
    notes.columns = [{width:24},{width:110}];
    notes.addRows([['整理对象',data.school],['资料更新',data.updated],['导出条数',records.length],
      ['单位汇总口径','统计获评及结果公示记录'], ...data.notes.map(note => ['整理说明',note])]);
    for (const item of workbook.worksheets) item.eachRow((row,index) => {
      row.font = {name:'微软雅黑',size:11,color:{argb:'FF233750'}};
      row.alignment = {vertical:'top',wrapText:true};
      if (index === 1) {
        row.font = {...row.font,bold:true,color:{argb:'FFFFFFFF'}};
        row.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF203A57'}};
        row.height = 30;
      }
    });
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '北航志愿服务荣誉名单.xlsx';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),2000);
  } catch (error) {
    $('notice').hidden = false;
    $('notice').textContent = error.message;
  } finally {
    button.disabled = !rows.length;
    button.textContent = '导出当前名单';
  }
}

function pickAward(award) {
  for (const id of fields) $(id).value = '';
  $('award').value = award;
  page = 1;
  changeTab('list');
}

try {
  const response = await fetch('data.json');
  if (!response.ok) throw Error('资料加载失败，请刷新后重试');
  data = await response.json();
  data.records = data.records.map(normalizeRecord);
  const catalog = [...data.catalog].sort((a, b) => compareAwards({level: a.level, award: a.name}, {level: b.level, award: b.name}));
  $('updated').textContent = '资料整理于 ' + data.updated.replaceAll('-', '.');
  fill('year', [...new Set(select(data.records).map(currentYear))]);
  fill('award', catalog.map(item => item.name));
  fill('unit', [...new Set(data.records.map(row => row.unit).filter(Boolean))].sort((a,b) => a.localeCompare(b,'zh')));
  $('catalogCards').innerHTML = catalog.map(item => {
    const matches = select(data.records,{award:item.name});
    const confirmed = matches.filter(verified).length;
    const summary = matches.length
      ? confirmed + ' 条获评或结果公示' + (matches.length > confirmed ? ' · ' + (matches.length - confirmed) + ' 条待核' : '')
      : '暂缺结果名单';
    return '<article class="catalog-card"><h3>' + escape(item.name) + '</h3><p>' + summary +
      '</p>' + (matches.length ? '<button data-catalog="' + escape(item.name) + '">查看历年名单 ↗</button>' : '') + '</article>';
  }).join('');
  $('notes').innerHTML = data.notes.map(note => '<li>' + escape(note) + '</li>').join('');
  $('issues').innerHTML = data.issues.map(issue => '<div class="issue"><strong>' + escape(issue.title) +
    '</strong><p>' + escape(issue.detail) + '</p></div>').join('');
  $('sourceRows').innerHTML = data.sources.map(source =>
    '<div class="source-item">' + link(source.url, source.title) + '</div>').join('');
  for (const id of fields) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    page = 1;
    render();
  });
  $('prev').onclick = () => {page--; render();};
  $('next').onclick = () => {page++; render();};
  $('reset').onclick = () => pickAward('');
  $('export').onclick = exportExcel;
  $('close').onclick = () => $('detail').close();
  document.addEventListener('click',event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tab) changeTab(button.dataset.tab);
    if (button.dataset.detail) detail(button.dataset.detail);
    if (button.hasAttribute('data-award')) pickAward(button.dataset.award);
    if (button.hasAttribute('data-profile')) {
      $('kind').value = '个人';
      $('profile').value = button.dataset.profile;
      page = 1;
      changeTab('list');
    }
    if (button.dataset.catalog) pickAward(button.dataset.catalog);
    if (button.dataset.year) {
      $('year').value = $('year').value === button.dataset.year ? '' : button.dataset.year;
      page = 1;
      render();
      document.querySelector('[data-year="' + CSS.escape(button.dataset.year) + '"]')?.focus();
    }
  });
  changeTab('list');
  new ResizeObserver(height).observe(document.body);
} catch (error) {
  $('notice').hidden = false;
  $('notice').textContent = error.message || '加载失败，请稍后重试。';
}
