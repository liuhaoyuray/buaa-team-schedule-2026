import {
  columnsAt,
  loadWorkbook,
  scalar,
  readTemplate,
  exportTemplate,
} from "./shared/io.mjs";
import { preparePeople, plan, hours, validDate } from "./shared/core.mjs";
import { prepareRows } from "./queue.mjs";

const hourFieldAliases = {
  name: ["姓名", "志愿者姓名", "学生姓名", "人员姓名", "名字", "name"],
  volunteerId: [
    "志愿者编号",
    "志愿北京编号",
    "志愿者号",
    "系统编号",
    "志愿者id",
    "志愿者编码",
    "volunteerid",
  ],
  card: ["身份证号", "身份证号码", "证件号", "证件号码", "身份证", "证件编号"],
};
export function normalizeHourHeader(value) {
  return String(scalar(value) ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[：:*＊]/g, "")
    .replace(/[\/_-](?:小时|h|hours?)$/, "");
}
function hourColumnRank(value, field) {
  const header = normalizeHourHeader(value);
  if (field !== "hours")
    return hourFieldAliases[field].includes(header) ? 100 : 0;
  if (
    /^(?:拟|待|应|计划|申请|本次)(?:录入)?(?:志愿服务|志愿|服务)?(?:总)?(?:时长|时数|小时数)$/.test(
      header,
    )
  )
    return 130;
  if (
    [
      "总时长",
      "总服务时长",
      "总志愿时长",
      "总志愿服务时长",
      "时长合计",
      "totalhours",
    ].includes(header)
  )
    return 120;
  if (
    [
      "录入时长",
      "志愿时长",
      "志愿服务时长",
      "服务时长",
      "时长",
      "时数",
      "小时数",
      "hours",
      "duration",
    ].includes(header)
  )
    return 100;
  // Already-recorded hours, registration times and blood volume are not requested new hours.
  return 0;
}
export function parseHourValue(value, format = "") {
  const raw = scalar(value);
  if (value?.formula || value?.sharedFormula) {
    if (
      value.result === undefined ||
      value.result === null ||
      value.result === ""
    )
      return {
        total: null,
        issue: "时长公式没有计算结果，请在 Excel 中计算并保存后重传",
      };
  }
  if (raw === "" || raw === null || raw === undefined)
    return { total: null, issue: "未填写时长" };
  let total = null;
  const durationFormat = /\[(?:h+|m+)\]|h+:mm/i.test(format);
  if (raw instanceof Date && durationFormat) {
    total =
      raw.getUTCFullYear() < 1901
        ? (+raw - Date.UTC(1899, 11, 30)) / 3600000
        : null;
  } else if (typeof raw === "number") {
    total = durationFormat ? raw * 24 : raw;
  } else {
    const textValue = String(raw)
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
    const decimal = textValue.match(
      /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|小时|小時|时|时长)?$/,
    );
    const clock = textValue.match(/^(\d{1,4}):([0-5]\d)(?::([0-5]\d))?$/);
    const compound = textValue.match(
      /^(?:(\d+(?:\.\d+)?)(?:小时|小時|h|时))?(?:(\d+(?:\.\d+)?)(?:分钟|min|分))?$/,
    );
    const half = textValue.match(/^(\d+)(?:个)?(?:小时|时)半$/);
    if (decimal) total = Number(decimal[1]);
    else if (clock)
      total =
        Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3] || 0) / 3600;
    else if (textValue === "半小时" || textValue === "半个小时") total = 0.5;
    else if (half) total = Number(half[1]) + 0.5;
    else if (compound && (compound[1] || compound[2]))
      total = Number(compound[1] || 0) + Number(compound[2] || 0) / 60;
  }
  if (!Number.isFinite(total) || total === null)
    return {
      total: null,
      issue: "无法识别时长，请使用小时数、小时分钟或 HH:MM",
    };
  total = Math.round(total * 100000000) / 100000000;
  if (total < 0.5 || (total * 2) % 1 !== 0)
    return {
      total,
      issue: "须至少 0.5 小时且按半小时递增；保留原值，未自动取整",
    };
  return { total, issue: "" };
}
const hourColumnLetter = (number) => {
  let label = "";
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
};
export async function readHourSheets(buffer, ExcelJS) {
  const workbook = await loadWorkbook(buffer, ExcelJS);
  return workbook.worksheets
    .filter((sheet) => sheet.state === "visible")
    .map((sheet) => {
      let best = { header: 1, score: -1, fields: {} };
      let legacy = null;
      for (let header = 1; header <= Math.min(60, sheet.rowCount); header++) {
        const fields = {};
        const ranks = {};
        sheet.getRow(header).eachCell((cell, col) => {
          for (const field of ["name", "volunteerId", "card", "hours"]) {
            const rank = hourColumnRank(cell.value, field);
            if (rank > (ranks[field] || 0)) {
              fields[field] = col;
              ranks[field] = rank;
            }
          }
        });
        const score =
          Number(!!fields.name) * 5 +
          Number(!!fields.hours) * 5 +
          Number(!!(fields.volunteerId || fields.card)) * 5;
        if (score > best.score) best = { header, score, fields };
        const old = columnsAt(sheet, header);
        if (!legacy && old.name && old.hours && (old.volunteerId || old.card))
          legacy = { header, fields: old };
      }
      const initial = { ...best.fields };
      let header = best.header,
        fields = { ...initial };
      const result = {
        name: sheet.name,
        automaticFields: { ...initial },
        get headerRow() {
          return header;
        },
        get fields() {
          return { ...fields };
        },
        get columns() {
          return Array.from(
            { length: Math.min(200, sheet.columnCount) },
            (_, index) => ({
              column: index + 1,
              label:
                hourColumnLetter(index + 1) +
                " · " +
                String(
                  scalar(sheet.getCell(header, index + 1).value) || "无表头",
                ).trim(),
            }),
          );
        },
        get issue() {
          const missing = [
            !fields.name && "姓名",
            !(fields.volunteerId || fields.card) && "志愿者编号或证件号码",
            !fields.hours && "总时长（也支持拟录入时长、服务时长等）",
          ].filter(Boolean);
          return missing.length
            ? "工作表「" +
                sheet.name +
                "」缺少必填列：" +
                missing.join("、") +
                "。可以调整识别列，或补充后重新选择文件。"
            : "";
        },
        signature() {
          return JSON.stringify([
            header,
            fields.name || 0,
            fields.volunteerId || 0,
            fields.card || 0,
            fields.hours || 0,
          ]);
        },
        legacySignature: legacy
          ? JSON.stringify([
              legacy.header,
              legacy.fields.name || 0,
              legacy.fields.volunteerId || 0,
              legacy.fields.card || 0,
              legacy.fields.hours || 0,
            ])
          : null,
        configure(patch) {
          for (const field of ["name", "volunteerId", "card", "hours"])
            if (Object.hasOwn(patch, field))
              fields[field] = Number(patch[field]) || 0;
        },
        read() {
          if (result.issue) throw Error(result.issue);
          const selected = [
            fields.name,
            fields.volunteerId || fields.card,
            fields.hours,
          ];
          if (new Set(selected).size !== selected.length)
            throw Error("姓名、编号和时长需要选择不同的列。");
          const records = [];
          let ignored = 0;
          for (let row = header + 1; row <= sheet.rowCount; row++) {
            const get = (field) =>
              fields[field]
                ? scalar(sheet.getCell(row, fields[field]).value)
                : "";
            const name = String(get("name") ?? "").trim();
            const identity = get("volunteerId") || get("card");
            if (!name && !identity && get("hours") === "") continue;
            if (
              (!identity &&
                /^(?:总?合计|小计|总计|备注|说明|填表说明)[：: ]?/.test(
                  name,
                )) ||
              (hourColumnRank(get("name"), "name") &&
                (hourColumnRank(get("hours"), "hours") ||
                  hourColumnRank(identity, "volunteerId") ||
                  hourColumnRank(identity, "card")))
            ) {
              ignored++;
              continue;
            }
            const person = prepareRows(
              [[row, name, get("card"), get("volunteerId")]],
              "activity",
            )[0] || {
              row,
              name,
              cert: "",
              identifier: fields.volunteerId ? "number" : "cert",
              issue: "有时长但缺少姓名和身份信息，请核对原表",
            };
            const cell = sheet.getCell(row, fields.hours);
            const parsed = parseHourValue(cell.value, cell.numFmt || "");
            person.issue ||= parsed.issue;
            let rawHours = String(scalar(cell.value) ?? "");
            if (
              Number.isFinite(parsed.total) &&
              /\[(?:h+|m+)\]|h+:mm/i.test(cell.numFmt || "")
            ) {
              const minutes = Math.round(parsed.total * 60);
              rawHours =
                String(Math.floor(minutes / 60)).padStart(2, "0") +
                ":" +
                String(minutes % 60).padStart(2, "0") +
                "（Excel 时间格式）";
            } else if (cell.value?.formula && cell.value.result === undefined)
              rawHours = "=" + cell.value.formula;
            records.push({
              ...person,
              total: parsed.total,
              rawHours,
              hourExplanation:
                parsed.issue ||
                (String(scalar(cell.value)).trim() !== String(parsed.total)
                  ? "已换算为 " + parsed.total + " 小时"
                  : ""),
            });
            if (records.length > 500) throw Error("每批最多 500 人。");
          }
          if (!records.length)
            throw Error("没有读到人员时长，请核对表头行和识别列。");
          const seen = new Map();
          for (const person of records) {
            if (!person.cert) continue;
            const key = person.identifier + ":" + person.cert;
            const previous = seen.get(key);
            if (previous) {
              const issue =
                previous.name === person.name && previous.total === person.total
                  ? "相同身份及相同时长重复登记，需核对后去重；未自动累加"
                  : "同一身份的姓名或时长不一致，需核对原表；未自动累加";
              previous.issue = issue;
              person.issue = issue;
            } else seen.set(key, person);
          }
          result.ignored = ignored;
          return records;
        },
      };
      return result;
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
