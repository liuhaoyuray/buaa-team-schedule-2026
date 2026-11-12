import {
  columnsAt,
  loadWorkbook,
  scalar,
  readTemplate,
  exportTemplate,
} from "./shared/io.mjs";
import { preparePeople, plan, hours, validDate } from "./shared/core.mjs";
import { prepareRows } from "./queue.mjs";

export async function readHourSheets(buffer, ExcelJS) {
  const workbook = await loadWorkbook(buffer, ExcelJS);
  return workbook.worksheets.flatMap((sheet) => {
    let best = { score: -1, fields: {} };
    for (let header = 1; header <= Math.min(30, sheet.rowCount); header++) {
      const fields = columnsAt(sheet, header);
      const score =
        Number(!!fields.name) +
        Number(!!fields.hours) +
        Number(!!(fields.volunteerId || fields.card));
      if (score > best.score) best = { score, fields };
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
                  : "";
              if (!get("name") && !get("volunteerId") && !get("card")) continue;
              const person = prepareRows(
                [[row, get("name"), get("card"), get("volunteerId")]],
                "activity",
              )[0];
              const total = hours(get("hours"));
              if (total === null || total < 0.5 || (total * 2) % 1)
                person.issue ||= "总时长须为 0.5 小时的正整数倍";
              records.push({ ...person, total });
              if (records.length > 500) throw Error("每批最多 500 人。");
            }
            if (!records.length) throw Error("没有读到人员时长。");
            const seen = new Map();
            for (const person of records) {
              const key = person.identifier + ":" + person.cert;
              if (seen.has(key)) {
                person.issue = "名单中身份重复，请先合并总时长";
                seen.get(key).issue = person.issue;
              }
              seen.set(key, person);
            }
            return records;
          },
        },
      ];
    }
    const missing = [
      !best.fields.name && "姓名",
      !(best.fields.volunteerId || best.fields.card) && "志愿者编号或证件号码",
      !best.fields.hours && "总时长",
    ].filter(Boolean);
    const issue =
      "工作表「" +
      sheet.name +
      "」缺少必填列：" +
      missing.join("、") +
      "。请补充后重新选择文件。";
    return [
      {
        name: sheet.name,
        issue,
        read() {
          throw Error(issue);
        },
      },
    ];
  });
}

export const defaultHourNotes = (activity) =>
  activity.trim()
    ? "录入" +
      activity.trim() +
      (/活动$/.test(activity.trim()) ? "" : "活动") +
      "志愿者时长，根据实际工作时长录入"
    : "";

export async function fillHourBatchTemplate(buffer, records, date, ExcelJS) {
  const template = readTemplate(
    await loadWorkbook(buffer, ExcelJS),
    "官网批量时长模板",
    0,
  );
  template.buffer = buffer;
  const seen = new Set();
  const rows = records.map((record) => {
    const matches = template.rows.filter(
      (row) => row.id === record.number && row.name === record.name,
    );
    if (matches.length !== 1 || seen.has(record.number))
      throw Error(
        "官网模板不能唯一核对第 " +
          record.row +
          " 行的姓名及编号，本批未提交。",
      );
    if (
      !(record.hours > 0 && record.hours <= 8 && (record.hours * 2) % 1 === 0)
    )
      throw Error("批量时长须按半小时递增，且每天不超过 8 小时。");
    seen.add(record.number);
    return { ...matches[0], hours: record.hours };
  });
  return exportTemplate(
    template,
    {
      date,
      records: rows,
      hours: rows.reduce((sum, row) => sum + row.hours, 0),
    },
    ExcelJS,
  );
}

export function allocateHourDays(person, remaining, dates, used) {
  const people = preparePeople([
    {
      name: person.name,
      volunteerId: person.cert,
      hours: remaining,
      source: "人员清单",
    },
  ]);
  return plan(
    people,
    [
      {
        uid: "current",
        label: "当前岗位",
        dates,
        rows: [{ name: person.name, id: person.cert }],
      },
    ],
    new Set([...used].map((date) => person.cert + "|" + date)),
  ).entries[0].allocations;
}

export function hourDates(dates, start, end, reverse) {
  if (!validDate(start) || !validDate(end) || start > end)
    throw Error("请选择本次实际服务的起止日期。");
  const result = [...new Set(dates)]
    .filter((date) => validDate(date) && date >= start && date <= end)
    .sort();
  return reverse ? result.reverse() : result;
}
