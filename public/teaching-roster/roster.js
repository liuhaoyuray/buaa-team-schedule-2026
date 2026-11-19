const search = document.querySelector('#search');
const cohort = document.querySelector('#cohort');
const province = document.querySelector('#province');
const filters = [search, cohort, province];
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

function normalize(value) {
  return value.toLowerCase().replace(/[\s·・]+/g, '');
}

function render() {
  const query = normalize(search.value);
  const matches = roster.filter(member =>
    (!cohort.value || member.cohort === Number(cohort.value)) &&
    (!province.value || member.province === province.value) &&
    (!query || [member.name, member.college, member.province, member.locality, member.organization]
      .some(value => normalize(value).includes(query)))
  );
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
    province.addEventListener('change', filterChanged);
    reset.addEventListener('click', () => {
      for (const control of filters) control.value = '';
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
