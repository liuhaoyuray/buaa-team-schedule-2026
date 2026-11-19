const search = document.querySelector('#search');
const cohort = document.querySelector('#cohort');
const province = document.querySelector('#province');
const locality = document.querySelector('#locality');
const filters = [search, cohort, province, locality];
const exportButton = document.querySelector('#export');
const exportStatus = document.querySelector('#export-status');
const status = document.querySelector('#status');
const tbody = document.querySelector('#members');
const pagination = document.querySelector('.pagination');
const prev = document.querySelector('#prev');
const next = document.querySelector('#next');
const reset = document.querySelector('#reset');
const pageSize = 20;
const mobileLabels = ['', '', '学院', '服务地', '服务单位', '服务时间'];
let roster = [];
let page = 1;
let exporting = false;

function normalize(value) {
  return value.toLowerCase().replace(/[\s·・]+/g, '');
}

function filteredRoster() {
  const query = normalize(search.value);
  return roster.filter(member =>
    (!cohort.value || member.cohort === Number(cohort.value)) &&
    (!province.value || member.province === province.value) &&
    (!locality.value || member.locality === locality.value) &&
    (!query || [member.name, member.college, member.province, member.locality, member.organization]
      .some(value => normalize(value).includes(query)))
  );
}

function render() {
  const matches = filteredRoster();
  exportButton.disabled = exporting || !matches.length;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  page = Math.min(page, pageCount);
  const offset = (page - 1) * pageSize;
  const result = matches.slice(offset, offset + pageSize);
  const rows = result.map(member => {
    const row = document.createElement('tr');
    const cells = [
      `第${member.cohort}届 / ${member.year}`,
      member.name,
      member.college,
      `${member.province} ${member.locality}`,
      member.organization,
      member.period,
    ];
    row.setAttribute('role', 'row');
    for (const [index, value] of cells.entries()) {
      const cell = row.insertCell();
      cell.setAttribute('role', 'cell');
      if (mobileLabels[index]) cell.dataset.label = mobileLabels[index];
      cell.textContent = value || '—';
    }
    return row;
  });
  tbody.replaceChildren(...rows);
  status.textContent = result.length
    ? `共 ${matches.length} 人，显示第 ${offset + 1}–${offset + result.length} 条`
    : '没有符合条件的成员。';
  document.querySelector('.table-wrap').hidden = !result.length;
  pagination.hidden = pageCount <= 1;
  document.querySelector('#page-label').textContent = `第 ${page} / ${pageCount} 页`;
  prev.disabled = page === 1;
  next.disabled = page === pageCount;
}

function filterChanged() {
  page = 1;
  render();
}

function addOptions(select, entries) {
  for (const [value, label] of entries) select.add(new Option(label, value));
}

function updateLocalities() {
  const previous = locality.value;
  const places = roster
    .filter(member => !province.value || member.province === province.value)
    .map(member => member.locality).filter(Boolean);
  const options = [...new Set(places)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  locality.length = 1;
  addOptions(locality, options.map(value => [value, value]));
  locality.value = options.includes(previous) ? previous : '';
}

async function exportRoster() {
  const rows = filteredRoster();
  if (!rows.length || exporting) return;
  exporting = true;
  exportButton.disabled = true;
  exportStatus.hidden = false;
  exportStatus.textContent = '正在生成 Excel…';
  try {
    if (!window.ExcelJS) await import('../vendor/exceljs-4.4.0.min.js');
    const book = new window.ExcelJS.Workbook();
    const sheet = book.addWorksheet('研支团成员名单');
    sheet.columns = [
      {header: '届次', key: 'cohort', width: 11},
      {header: '派出年份', key: 'year', width: 13},
      {header: '姓名', key: 'name', width: 22},
      {header: '学院', key: 'college', width: 38},
      {header: '服务省区', key: 'province', width: 14},
      {header: '服务地', key: 'locality', width: 21},
      {header: '服务单位', key: 'organization', width: 37},
      {header: '服务时间', key: 'period', width: 22},
    ];
    sheet.addRows(rows);
    sheet.views = [{state: 'frozen', ySplit: 1}];
    sheet.autoFilter = 'A1:H' + sheet.rowCount;
    sheet.getRow(1).eachCell(cell => {
      cell.font = {bold: true, color: {argb: 'FFFFFFFF'}};
      cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF25455F'}};
    });
    const content = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([content], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '北航历届研支团成员名单（' + rows.length + '人）.xlsx';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    exportStatus.textContent = '已导出 ' + rows.length + ' 条记录。';
  } catch (error) {
    console.error(error);
    exportStatus.textContent = '导出失败，请重试。';
  } finally {
    exporting = false;
    exportButton.disabled = !filteredRoster().length;
  }
}

async function load() {
  try {
    const response = await fetch(new URL('data.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    roster = await response.json();
    const cohorts = [...new Map(roster.map(member => [member.cohort, member.year]))];
    addOptions(cohort, cohorts.map(([number, year]) => [String(number), `第${number}届（${year}年）`]));
    const provinces = [...new Set(roster.map(member => member.province))];
    addOptions(province, provinces.map(value => [value, value]));
    const [latest, earliest] = [cohorts[0], cohorts.at(-1)];
    document.querySelector('#coverage').textContent =
      `${earliest[1]}—${latest[1]}年 · 第${earliest[0]}至${latest[0]}届 · ${roster.length} 条记录`;

    search.addEventListener('input', filterChanged);
    cohort.addEventListener('change', filterChanged);
    updateLocalities();
    province.addEventListener('change', () => {
      updateLocalities();
      filterChanged();
    });
    locality.addEventListener('change', filterChanged);
    exportButton.addEventListener('click', exportRoster);
    reset.addEventListener('click', () => {
      for (const control of filters) control.value = '';
      updateLocalities();
      filterChanged();
    });
    prev.addEventListener('click', () => { page -= 1; render(); });
    next.addEventListener('click', () => { page += 1; render(); });
    render();
  } catch (error) {
    console.error(error);
    status.textContent = '名单加载失败，请刷新页面后重试。';
    document.querySelector('.table-wrap').hidden = true;
    for (const control of [...filters, reset]) control.disabled = true;
  }
}

if (window.parent !== window) {
  document.documentElement.classList.add('embedded');
  const container = document.querySelector('main');
  new ResizeObserver(() => {
    window.parent.postMessage({type: 'teaching-roster-height', height: container.offsetHeight}, location.origin);
  }).observe(container);
}

load();
