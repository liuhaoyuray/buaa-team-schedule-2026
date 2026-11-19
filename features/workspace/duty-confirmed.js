(() => {
  'use strict';

  const official = /*__CONFIRMED_DUTY__*/;
  const departments = Object.keys(official.sheets);
  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五'];
  const slots = [
    {label: '1–2节', start: '08:00', end: '09:35'},
    {label: '3–5节', start: '09:50', end: '12:15'},
    {label: '6–7节', start: '14:00', end: '15:35'},
    {label: '8–10节', start: '15:50', end: '18:15'},
  ];
  const shanghaiClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const cells = Object.fromEntries(departments.map(department => [
    department,
    official.sheets[department].map(row => row.map(value => String(value ?? '')
      .split(/\r?\n/).map(name => name.replace(/\s+/g, '')).filter(Boolean).join('\n'))),
  ]));
  let current = departments[0];
  let visibleSlot = null;

  function statusAt(instant) {
    const parts = Object.fromEntries(shanghaiClock.formatToParts(instant).map(({type, value}) => [type, value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    const info = E.dayInfo(date, DATA, storeState.rules);
    const slot = slots.findIndex(({start, end}) => time >= start && time < end);
    const endWeek = DATA.meta.dutyModule?.endWeek ?? DATA.meta.teachingWeeks;
    const withinTerm = info.valid && info.week <= endWeek;
    const day = info.day - 1;
    return {time, date, slot, day, active: withinTerm && day < weekdays.length && !info.stop && slot >= 0};
  }

  function renderTable(status) {
    document.querySelectorAll('[data-confirmed-dept]').forEach(button => {
      const selected = button.dataset.confirmedDept === current;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const head = weekdays.map(label => '<th scope="col">' + label + '</th>').join('');
    const body = cells[current].map((row, slotIndex) => {
      const {label, start, end} = slots[slotIndex];
      const html = row.map((value, dayIndex) => {
        const now = status.active && status.slot === slotIndex && status.day === dayIndex;
        return '<td' + (now ? ' class="confirmed-duty-now" aria-current="time"' : '') + '>'
          + escapeHTML(value || '—') + '</td>';
      }).join('');
      return '<tr><th scope="row">' + label + '<br>' + start + '–' + end + '</th>' + html + '</tr>';
    }).join('');
    $('confirmedDutyTable').innerHTML = '<table><thead><tr><th scope="col">时间</th>' + head
      + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function refresh() {
    const status = statusAt(new Date());
    const {active, date, time, slot, day} = status;
    const clock = '北京时间 ' + time;
    $('wsDutyTime').textContent = active
      ? clock + ' · ' + slots[slot].start + '–' + slots[slot].end
      : clock + ' · 当前无值班安排';
    for (const department of departments) {
      const target = document.querySelector('[data-current-duty="' + department + '"]');
      target.textContent = active ? cells[department][slot][day].split('\n').join('、') || '—' : '—';
    }
    const key = active ? date + ':' + slot : '';
    if (key !== visibleSlot) {
      visibleSlot = key;
      renderTable(status);
    }
  }

  document.querySelectorAll('[data-confirmed-dept]').forEach(button => {
    button.onclick = () => {
      current = button.dataset.confirmedDept;
      renderTable(statusAt(new Date()));
    };
  });
  $('confirmedDutyExport').onclick = () => {
    const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = departments.flatMap(department => [
      [department, ...weekdays],
      ...cells[department].map((row, index) => {
        const {label, start, end} = slots[index];
        return [label + ' ' + start + '–' + end, ...row];
      }),
      [],
    ]);
    download('已确定值班表.csv', '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };

  refresh();
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
