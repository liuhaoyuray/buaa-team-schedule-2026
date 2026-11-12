import { aliases, columnsAt, loadWorkbook, scalar } from './shared/io.mjs';
import { preparePeople, plan, hours, validDate } from './shared/core.mjs';
import { prepareRows } from './queue.mjs';

export async function readHourSheets(buffer, ExcelJS) {
  const workbook = await loadWorkbook(buffer, ExcelJS);
  return workbook.worksheets.flatMap((sheet) => {
    for (let header = 1; header <= Math.min(30, sheet.rowCount); header++) {
      const fields = columnsAt(sheet, header);
      if (!fields.name || !fields.hours || !(fields.volunteerId || fields.card))
        continue;
      return [
        {
          name: sheet.name,
          read() {
            const records = [];
            for (let row = header + 1; row <= sheet.rowCount; row++) {
              const get = (field) =>
                fields[field]
                  ? scalar(sheet.getCell(row, fields[field]).value)
                  : '';
              if (!get('name') && !get('volunteerId') && !get('card')) continue;
              const person = prepareRows(
                [[row, get('name'), get('card'), get('volunteerId')]],
                'activity',
              )[0];
              const total = hours(get('hours'));
              if (total === null || total < 0.5 || (total * 2) % 1)
                person.issue ||= '总时长须为 0.5 小时的正整数倍';
              records.push({ ...person, total });
              if (records.length > 500) throw Error('每批最多 500 人。');
            }
            if (!records.length) throw Error('没有读到人员时长。');
            const seen = new Set();
            for (const person of records) {
              const key = person.identifier + ':' + person.cert;
              if (seen.has(key))
                person.issue = '名单中身份重复，请先合并总时长';
              seen.add(key);
            }
            return records;
          },
        },
      ];
    }
    return [];
  });
}

export function allocateHourDays(person, remaining, dates, used) {
  const people = preparePeople([
    {
      name: person.name,
      volunteerId: person.cert,
      hours: remaining,
      source: '人员清单',
    },
  ]);
  return plan(
    people,
    [
      {
        uid: 'current',
        label: '当前岗位',
        dates,
        rows: [{ name: person.name, id: person.cert }],
      },
    ],
    new Set([...used].map((date) => person.cert + '|' + date)),
  ).entries[0].allocations;
}

export function hourDates(dates, start, end, reverse) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error('请选择本次实际服务的起止日期。');
  const result = [...new Set(dates)]
    .filter((date) => validDate(date) && date >= start && date <= end)
    .sort();
  return reverse ? result.reverse() : result;
}
