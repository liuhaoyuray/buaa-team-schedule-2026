import { environment } from "./environment.mjs";
import {
  readHourSheets,
  allocateHourDays,
  hourDates,
  defaultHourNotes,
  fillHourBatchTemplate,
} from "./hours-core.mjs";
import { makeHourProof } from "./hours-proof.mjs";
import { batchKey } from "./queue.mjs";
const root = environment.root;
const el = (id) => root.getElementById(id);
const status = (text) => {
  el("hours-status").textContent = text;
};
let refreshing = Promise.resolve(),
  refreshCount = 0;
let target = null,
  source = null,
  sheets = [],
  people = [],
  job = { days: {}, inFlight: null },
  jobKey = null,
  running = false,
  paused = false;
const send = environment.message;
let proofFile = null,
  proofUrl = null,
  notesEdited = false,
  proofRevision = 0,
  fileRevision = 0;
const Excel = environment.ExcelJS || globalThis.ExcelJS;
const method = () => el("hours-method").value;
function invalidateProof() {
  proofRevision++;
  proofFile = null;
  if (proofUrl) URL.revokeObjectURL(proofUrl);
  proofUrl = null;
  el("hours-proof-preview").hidden = true;
  el("hours-confirm").checked = false;
}
function fileError(message = "") {
  el("hours-file-error").textContent = message;
  el("hours-file-error").hidden = !message;
}
async function previewProof() {
  const revision = proofRevision;
  hourDates([], el("hours-start").value, el("hours-end").value, false);
  const activity = el("hours-activity-name").value.trim();
  if (!activity) throw Error("请填写实际活动名称。");
  const file =
    el("hours-proof-mode").value === "upload"
      ? el("hours-proof").files[0]
      : await makeHourProof({
          activity,
          group: target?.name || "",
          start: el("hours-start").value,
          end: el("hours-end").value,
          notes: el("hours-notes").value,
          people,
        });
  if (
    !file ||
    file.size >= 3 * 1024 * 1024 ||
    !["image/png", "image/jpeg"].includes(file.type)
  )
    throw Error("请选择小于 3 MB 的 PNG 或 JPG 证明图片。");
  if (revision !== proofRevision)
    throw Error("输入已改变，请重新预览证明图片。");
  if (proofUrl) URL.revokeObjectURL(proofUrl);
  proofFile = file;
  proofUrl = URL.createObjectURL(file);
  el("hours-proof-image").src = proofUrl;
  el("hours-proof-download").href = proofUrl;
  el("hours-proof-preview").hidden = false;
  return file;
}
async function encodeFile(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { base64, name: file.name, type: file.type };
}
for (const mode of ["member", "activity", "hours"]) {
  const link = root.getElementById("mode-" + mode);
  const url = new URL(link.getAttribute("href"), location.href);
  if (environment.parameters.get("tab"))
    url.searchParams.set("tab", environment.parameters.get("tab"));
  link.href = url.href;
}
function completed(person) {
  return Object.values(job.days)
    .filter(
      (day) =>
        day.row === person.row && ["added", "submitted"].includes(day.status),
    )
    .reduce((sum, day) => sum + day.hours, 0);
}
function render() {
  const rows = people.map((person) => {
    const done = completed(person);
    const tr = document.createElement("tr");
    for (const text of [
      person.row,
      person.name,
      person.total,
      Object.values(job.days)
        .filter((day) => day.row === person.row && day.status === "added")
        .reduce((sum, day) => sum + day.hours, 0),
      Object.values(job.days)
        .filter((day) => day.row === person.row && day.status === "submitted")
        .reduce((sum, day) => sum + day.hours, 0),
      Math.max(0, (person.total || 0) - done),
      person.issue || "",
    ]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  });
  el("hours-results").replaceChildren(...rows);
  for (const id of [
    "hours-file",
    "hours-sheet",
    "hours-proof",
    "hours-start",
    "hours-end",
    "hours-order",
    "hours-notes",
    "hours-confirm",
    "hours-connect",
    "hours-method",
    "hours-activity-name",
    "hours-proof-mode",
    "hours-notes-reset",
    "hours-preview",
  ])
    el(id).disabled = running || refreshCount > 0;
  const uncertain = Object.entries(job.days).filter(
    ([, day]) => day.status === "unknown",
  );
  el("hours-run").disabled =
    running ||
    refreshCount > 0 ||
    !target ||
    !people.some((person) => !person.issue) ||
    !proofFile ||
    !el("hours-confirm").checked ||
    !!uncertain.length;
  el("hours-pause").disabled = !running || paused;
  el("hours-export").disabled = running || !people.length;
  el("hours-unknown").replaceChildren(
    ...uncertain.map(([key, day]) => {
      const item = document.createElement("p");
      item.append(
        "原表第 " +
          day.row +
          " 行 · " +
          day.date +
          " · " +
          day.hours +
          " 小时，结果待核对。 ",
      );
      for (const [label, state] of [
        [
          day.method === "batch" ? "官网确认已提交审批" : "官网确认已录入",
          day.method === "batch" ? "submitted" : "added",
        ],
        ["官网确认未录入", "retry"],
      ]) {
        const button = document.createElement("button");
        button.textContent = label;
        button.disabled = running;
        button.onclick = async () => {
          const current = await environment.readTarget("hours");
          if (!same(current, target)) {
            status("请回到原岗位后核对。");
            return;
          }
          await navigator.locks.request(
            "member-import-running",
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                status("当前有提交正在运行，请稍后再核对。");
                return;
              }
              const latest =
                (await environment.storage.get(jobKey))[jobKey] || job;
              if (state !== "retry") latest.days[key].status = state;
              else delete latest.days[key];
              job = latest;
              await save();
              render();
            },
          );
        };
        item.append(button);
      }
      return item;
    }),
  );
}
const same = (a, b) =>
  a?.id === b?.id && a?.activityId === b?.activityId && a?.postId === b?.postId;
const save = () => environment.storage.set({ [jobKey]: job });
async function connect() {
  target = await environment.readTarget("hours");
  if (!target.id) target = null;
  el("hours-target").textContent = target
    ? "团体 · " +
      target.name +
      " ｜ 活动尾号 " +
      target.activityId.slice(-8) +
      " · 岗位尾号 " +
      target.postId.slice(-8)
    : "请打开官网岗位的「计时 → 时长录入」，再点重新检查。";
  render();
}
async function loadProgress() {
  el("hours-confirm").checked = false;
  people = [];
  job = { days: {}, inFlight: null };
  jobKey = null;
  const selected = sheets[Number(el("hours-sheet").value)];
  fileError(selected?.issue || "");
  if (selected?.issue) {
    status(selected.issue);
    return;
  }
  people = selected?.read() || [];
  if (source && target) {
    jobKey = await batchKey(
      "hours:" + JSON.stringify([target.id, target.activityId, target.postId]),
      sheets[Number(el("hours-sheet").value)]?.name || "",
      source,
    );
    await navigator.locks.request(
      "member-import-running",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error("另一个录入面板正在处理，请在那个面板继续。");
        const saved = (await environment.storage.get(jobKey))[jobKey];
        if (saved) {
          job = saved;
          if (job.inFlight) {
            for (const entry of job.inFlight.entries || [job.inFlight])
              job.days[entry.key] = { ...entry, status: "unknown" };
            job.inFlight = null;
            await save();
          }
        }
      },
    );
  }
  render();
}
function refreshProgress() {
  el("hours-confirm").checked = false;
  refreshCount++;
  render();
  refreshing = refreshing
    .catch(() => {})
    .then(loadProgress)
    .finally(() => {
      refreshCount--;
      render();
    });
  return refreshing;
}
async function safely(action) {
  try {
    await action();
  } catch (error) {
    status(error.message || "操作失败，请检查输入。");
  }
  render();
}
el("hours-connect").onclick = () =>
  safely(async () => {
    invalidateProof();
    await connect();
    await refreshProgress();
  });
el("hours-file").onchange = () =>
  safely(async () => {
    invalidateProof();
    fileError();
    people = [];
    sheets = [];
    source = null;
    jobKey = null;
    job = { days: {}, inFlight: null };
    el("hours-sheet").replaceChildren();
    el("hours-confirm").checked = false;
    el("hours-run").disabled = true;
    const file = el("hours-file").files[0];
    if (!file) return;
    const revision = ++fileRevision;
    if (file.size > 8 * 1024 * 1024) {
      fileError("名单最多 8 MB。");
      throw Error("名单最多 8 MB。");
    }
    const bytes = await file.arrayBuffer();
    let loaded;
    try {
      loaded = await readHourSheets(bytes, Excel);
    } catch (error) {
      fileError(error.message || "无法读取 Excel 文件，请检查文件格式。");
      throw error;
    }
    if (revision !== fileRevision) return;
    source = bytes;
    sheets = loaded;
    if (!sheets.length)
      throw Error("没有找到姓名、编号或证件号码、总时长这三列表头。");
    el("hours-sheet").replaceChildren(
      ...sheets.map(
        (sheet, index) =>
          new Option(sheet.name + (sheet.issue ? "（缺少必填列）" : ""), index),
      ),
    );
    el("hours-sheet").value = String(
      Math.max(
        0,
        sheets.findIndex((sheet) => !sheet.issue),
      ),
    );
    await refreshProgress();
    const invalid = sheets.filter((sheet) => sheet.issue);
    if (invalid.length)
      fileError(invalid.map((sheet) => sheet.issue).join(" "));
    status(
      people.length
        ? "已读取 " +
            people.length +
            " 人。请填写日期、活动名称，并预览证明图片。"
        : invalid[0]?.issue || "没有读到人员。",
    );
  });
for (const id of [
  "hours-sheet",
  "hours-start",
  "hours-end",
  "hours-order",
  "hours-proof",
])
  el(id).onchange = () => {
    invalidateProof();
    safely(refreshProgress);
  };
el("hours-method").onchange = () => {
  el("hours-method-hint").textContent =
    method() === "batch"
      ? "按日期自动生成官网模板并提交上级审批。已提交审批不代表时长已生效。"
      : "自动逐人录入，避开已有记录的日期。";
  el("hours-confirm").checked = false;
  render();
};
el("hours-proof-mode").onchange = () => {
  el("hours-proof-upload").hidden = el("hours-proof-mode").value !== "upload";
  invalidateProof();
  render();
};
el("hours-activity-name").oninput = () => {
  if (!notesEdited)
    el("hours-notes").value = defaultHourNotes(el("hours-activity-name").value);
  invalidateProof();
  render();
};
el("hours-notes").oninput = () => {
  notesEdited = true;
  invalidateProof();
  render();
};
el("hours-notes-reset").onclick = () => {
  notesEdited = false;
  el("hours-notes").value = defaultHourNotes(el("hours-activity-name").value);
  invalidateProof();
  render();
};
el("hours-preview").onclick = () =>
  safely(async () => {
    await refreshing;
    await previewProof();
    status("证明图片已生成或载入，请核对预览后勾选确认。");
  });
el("hours-confirm").onchange = render;
el("hours-pause").onclick = () => {
  paused = true;
  status("当前这次提交完成后暂停。");
  render();
};
async function runBatch() {
  const groups = new Map(),
    identities = new Set();
  for (const person of people) {
    if (paused) break;
    if (person.issue || person.total <= completed(person)) continue;
    status("批量准备：正在检查第 " + person.row + " 行的身份和历史日期。");
    const prepared = await send({ type: "hours-prepare", person, target });
    if (prepared.status === "rejected") {
      person.issue = prepared.reason;
      render();
      continue;
    }
    if (!prepared.dates || !prepared.number)
      throw Error(prepared.reason || "未能确认历史日期和编号，本批未提交。");
    if (identities.has(prepared.number))
      throw Error("多条名单对应同一个志愿者编号，请合并后再录入。");
    identities.add(prepared.number);
    const dates = hourDates(
      prepared.dates,
      el("hours-start").value,
      el("hours-end").value,
      el("hours-order").value === "desc",
    );
    const used = new Set(
      Object.values(job.days)
        .filter((day) => day.row === person.row)
        .map((day) => day.date),
    );
    const allocations = allocateHourDays(
      person,
      person.total - completed(person),
      dates,
      used,
    );
    for (const allocation of allocations) {
      const entries = groups.get(allocation.date) || [];
      entries.push({
        row: person.row,
        name: person.name,
        number: prepared.number,
        hours: allocation.hours,
      });
      groups.set(allocation.date, entries);
    }
    const shortage =
      person.total -
      completed(person) -
      allocations.reduce((sum, allocation) => sum + allocation.hours, 0);
    if (shortage > 0)
      person.issue = "可用日期不足，剩余 " + shortage + " 小时待处理";
    render();
  }
  const ordered = [...groups].sort(([a], [b]) =>
    el("hours-order").value === "desc"
      ? b.localeCompare(a)
      : a.localeCompare(b),
  );
  try {
    for (const [date, records] of ordered) {
      if (paused) break;
      // Recheck just before preparing each date, including records created since planning.
      for (const record of records) {
        if (paused) break;
        const person = people.find((person) => person.row === record.row);
        const fresh = await send({ type: "hours-prepare", person, target });
        if (!fresh.dates?.includes(date) || fresh.number !== record.number)
          throw Error(
            "第 " +
              record.row +
              " 行的 " +
              date +
              " 记录已变化，已暂停，本日期未提交。",
          );
      }
      if (paused) break;
      status("正在准备 " + date + " 的官网模板（" + records.length + " 人）。");
      const downloaded = await send({
        type: "hours-batch-template",
        target,
        date,
      });
      if (!downloaded.base64)
        throw Error(downloaded.reason || "官网模板未能下载，本日期未提交。");
      const template = Uint8Array.from(atob(downloaded.base64), (c) =>
        c.charCodeAt(0),
      );
      const bytes = await fillHourBatchTemplate(template, records, date, Excel);
      const file = await encodeFile(
        new File([bytes], "批量时长_" + date + ".xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      if (paused) break;
      const entries = records.map((record) => ({
        key: record.row + "|" + date,
        row: record.row,
        date,
        hours: record.hours,
        method: "batch",
      }));
      job.inFlight = { entries };
      await save();
      status("正在解析并提交 " + date + " 的上级审批申请。");
      let response;
      try {
        response = await send({
          type: "hours-batch-submit",
          target,
          date,
          records,
          file,
          notes: el("hours-notes").value,
        });
      } catch {
        response = {
          status: "unknown",
          reason: "批量审批连接中断，请核对官网导入记录。",
        };
      }
      if (!["submitted", "blocked"].includes(response?.status))
        response = { ...response, status: "unknown" };
      if (response.status !== "blocked")
        for (const entry of entries)
          job.days[entry.key] = { ...entry, ...response };
      job.inFlight = null;
      await save();
      render();
      if (response.status !== "submitted") throw Error(response.reason);
    }
  } finally {
    await send({ type: "hours-batch-close" }).catch(() => {});
  }
  status(
    paused
      ? "已暂停，已提交的审批申请已保存。"
      : "本轮批量审批申请处理结束。已提交审批的时长需等待上级审核。",
  );
}
el("hours-run").onclick = () =>
  safely(async () => {
    await refreshing;
    const file = proofFile;
    if (
      !file ||
      file.size >= 3 * 1024 * 1024 ||
      !["image/png", "image/jpeg"].includes(file.type)
    )
      throw Error("请先预览并核对证明图片。");
    hourDates([], el("hours-start").value, el("hours-end").value, false);
    if (!target || !jobKey || !el("hours-confirm").checked) return;
    running = true;
    paused = false;
    render();
    try {
      await navigator.locks.request(
        "member-import-running",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw Error("另一个录入批次正在运行。");
          const current = await environment.readTarget("hours");
          if (!same(current, target)) throw Error("目标岗位已经改变。");
          const saved = (await environment.storage.get(jobKey))[jobKey];
          if (saved) job = saved;
          if (
            job.inFlight ||
            Object.values(job.days).some((day) => day.status === "unknown")
          )
            throw Error("请先核对中断的提交结果。");
          await send({
            type: "hours-proof",
            proof: await encodeFile(file),
          });
          if (method() === "batch") {
            await runBatch();
            return;
          }
          for (const person of people) {
            if (paused) break;
            if (person.issue) continue;
            let remaining = person.total - completed(person);
            if (remaining <= 0) continue;
            status("正在核对原表第 " + person.row + " 行的历史日期。");
            const prepared = await send({
              type: "hours-prepare",
              person,
              target,
            });
            if (prepared.status === "rejected") {
              person.issue = prepared.reason;
              render();
              continue;
            }
            if (!prepared.dates)
              throw Error(prepared.reason || "未能读取历史日期，已保留进度。");
            const dates = hourDates(
              prepared.dates,
              el("hours-start").value,
              el("hours-end").value,
              el("hours-order").value === "desc",
            );
            const used = new Set(
              Object.values(job.days)
                .filter((day) => day.row === person.row)
                .map((day) => day.date),
            );
            while (remaining > 0 && !paused) {
              const next = allocateHourDays(person, remaining, dates, used)[0];
              if (!next) {
                person.issue =
                  "可用日期不足，剩余 " + remaining + " 小时待录入";
                break;
              }
              const date = next.date,
                amount = next.hours,
                key = person.row + "|" + date;
              const entry = { key, row: person.row, date, hours: amount };
              job.inFlight = entry;
              await save();
              status(
                "正在录入原表第 " +
                  person.row +
                  " 行 · " +
                  date +
                  " · " +
                  amount +
                  " 小时。",
              );
              let response;
              try {
                response = await send({
                  type: "hours-submit",
                  person,
                  target,
                  date,
                  hours: amount,
                  notes: el("hours-notes").value,
                });
              } catch {
                response = {
                  status: "unknown",
                  reason: "提交连接中断，请核对日期记录",
                };
              }
              if (!["added", "existing", "blocked"].includes(response?.status))
                response = { ...response, status: "unknown" };
              if (response.status !== "blocked")
                job.days[key] = { ...entry, ...response };
              job.inFlight = null;
              await save();
              render();
              if (["unknown", "blocked"].includes(response.status))
                throw Error(response.reason);
              used.add(date);
              remaining = person.total - completed(person);
            }
          }
          status(
            paused
              ? "已暂停，进度已保存。"
              : "本轮处理结束，请检查待录时长与明细。",
          );
        },
      );
    } finally {
      running = false;
      render();
    }
  });
el("hours-export").onclick = () => {
  const cell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const rows = [
    ["原表行号", "日期", "本次小时数", "状态", "说明"],
    ...Object.values(job.days).map((day) => [
      day.row,
      day.date,
      day.hours,
      day.status === "added"
        ? "已录入"
        : day.status === "submitted"
          ? "已提交审批，尚待上级审批"
          : day.status === "existing"
            ? "已有记录，已避开"
            : "待核对",
      day.reason || "",
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "时长录入明细.csv";
  (root.body || root).append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener(
  "beforeunload",
  (event) => {
    if (running) {
      event.preventDefault();
      event.returnValue = true;
    }
  },
  environment.signal ? { signal: environment.signal } : undefined,
);
safely(connect);
