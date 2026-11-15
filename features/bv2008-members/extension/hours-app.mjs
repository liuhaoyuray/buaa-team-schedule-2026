import { environment } from "./environment.mjs";
import {
  readHourSheets,
  allocateHourDays,
  hourDates,
  defaultHourNotes,
  fillHourBatchTemplate,
  projectHourCandidates,
  mergeLegacyHourProgress,
} from "./hours-core.mjs";
import { loadWorkbook, readTemplate } from "./shared/io.mjs";
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
let contextChoice = { key: "", activity: false, dates: false };
const Excel = environment.ExcelJS || globalThis.ExcelJS;
const Zip = environment.JSZip || globalThis.JSZip;
let postsKey = "",
  rosterCache = null;
const method = () => el("hours-method").value;
const projectMode = () =>
  method() === "batch" && el("hours-scope").value === "project";
const selectedPosts = () =>
  [
    ...el("hours-posts-list").querySelectorAll(
      "input[data-hours-post]:checked",
    ),
  ].map((input) => ({
    id: input.dataset.hoursPost,
    name: input.dataset.postName,
  }));
function showPosts() {
  const key = target ? target.id + "|" + target.activityId : "";
  const previous =
    key === postsKey ? new Set(selectedPosts().map((post) => post.id)) : null;
  postsKey = key;
  el("hours-posts-list").replaceChildren(
    ...(target?.posts || []).map((post) => {
      const label = document.createElement("label");
      label.className = "check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = previous ? previous.has(post.id) : true;
      checkbox.dataset.hoursPost = post.id;
      checkbox.dataset.postName = post.name;
      checkbox.onchange = () => {
        rosterCache = null;
        invalidateProof();
        render();
      };
      label.append(
        checkbox,
        post.name + (post.id === target.postId ? "（当前岗位）" : ""),
      );
      return label;
    }),
  );
  el("hours-posts-summary").textContent = target?.posts?.length
    ? "已读取项目 " +
      target.posts.length +
      " 个岗位，默认全部勾选。模板包含岗位全部志愿者，不受官网当前搜索或勾选影响。"
    : "尚未读到项目完整岗位列表，请重新检查后下载。";
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  (root.body || root).append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const projectSend = (data) => send({ type: "hours-project", target, ...data });
async function projectTemplates(force = false) {
  const chosen = selectedPosts(),
    date = el("hours-start").value || target?.dates?.[0];
  if (!target?.posts?.length || !chosen.length)
    throw Error("请先读取项目完整岗位列表，并至少勾选一个岗位。");
  if (!target.dates?.includes(date))
    throw Error("请选择官网可录入的服务日期后下载模板。");
  const key = JSON.stringify([
    target.id,
    target.activityId,
    date,
    chosen.map((post) => post.id),
  ]);
  if (!force && rosterCache?.key === key) return rosterCache.rosters;
  const rosters = [];
  for (const [index, post] of chosen.entries()) {
    if (paused) throw Error("模板下载已暂停。");
    status(
      "正在从官网下载岗位模板 " +
        (index + 1) +
        "/" +
        chosen.length +
        "：" +
        post.name,
    );
    const response = await projectSend({
      action: "template",
      postId: post.id,
      date,
    });
    if (!response.base64)
      throw Error('岗位「'+post.name+'」模板下载失败：'+(response.reason || "官网下载模板未成功，已停止。"));
    const buffer = Uint8Array.from(atob(response.base64), (c) =>
      c.charCodeAt(0),
    );
    let template;
    try {
      template = readTemplate(
        await loadWorkbook(buffer, Excel),
        post.name,
        post.id,
      );
    } catch (error) {
      if (/没有人员记录/.test(error.message)) template = { rows: [] };
      else throw error;
    }
    rosters.push({
      ...template,
      buffer,
      postId: post.id,
      postName: post.name,
      templateDate: date,
    });
  }
  rosterCache = { key, rosters };
  el("hours-posts-summary").textContent =
    "已从官网下载 " +
    rosters.length +
    " 个岗位模板，共 " +
    rosters.reduce((n, roster) => n + roster.rows.length, 0) +
    " 条岗位成员记录；同一编号跨岗位匹配时只计一人。";
  return rosters;
}
const selectedSheet = () => sheets[Number(el("hours-sheet").value)];
function configureColumns() {
  const sheet = selectedSheet();
  const columns = sheet?.columns || [];
  for (const [id, field] of [
    ["hours-name-column", "name"],
    ["hours-value-column", "hours"],
  ]) {
    el(id).replaceChildren(
      new Option("请选择列", "0"),
      ...columns.map((column) => new Option(column.label, column.column)),
    );
    el(id).value = String(sheet?.fields[field] || 0);
  }
  el("hours-identity-column").replaceChildren(
    new Option("自动：编号优先，空白时用证件号码", "auto"),
    new Option("仅按姓名匹配（重名时暂停）", "name"),
    ...columns.flatMap((column) => [
      new Option(
        "志愿者编号 · " + column.label,
        "volunteerId:" + column.column,
      ),
      new Option("证件号码 · " + column.label, "card:" + column.column),
    ]),
  );
  if (
    sheet &&
    (sheet.fields.volunteerId !== sheet.automaticFields.volunteerId ||
      sheet.fields.card !== sheet.automaticFields.card)
  )
    el("hours-identity-column").value = sheet.fields.volunteerId
      ? "volunteerId:" + sheet.fields.volunteerId
      : sheet.fields.card
        ? "card:" + sheet.fields.card
        : "name";
}
function analysisSummary() {
  const sheet = selectedSheet();
  if (!sheet) {
    el("hours-analysis").textContent = "";
    return;
  }
  const valid = people.filter((person) => !person.issue);
  const column = (field) =>
    sheet.columns.find((column) => column.column === sheet.fields[field])
      ?.label || "未识别";
  el("hours-analysis").textContent =
    "采用第 " +
    sheet.headerRow +
    " 行作表头；姓名：" +
    column("name") +
    "；时长：" +
    column("hours") +
    "。识别 " +
    people.length +
    " 人，可处理 " +
    valid.length +
    " 人、" +
    valid.reduce((sum, person) => sum + person.total, 0) +
    " 小时，需修正 " +
    (people.length - valid.length) +
    " 人。" +
    (sheet.ignored
      ? "已忽略 " + sheet.ignored + " 行重复表头或合计说明。"
      : "") +
    (sheets.filter((other) => other !== sheet && other.issue).length
      ? " 其他工作表的缺列提示仅在切换到该表时显示。"
      : "");
}
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
      person.rawHours ?? "",
      person.total ?? "—",
      Object.values(job.days)
        .filter((day) => day.row === person.row && day.status === "added")
        .reduce((sum, day) => sum + day.hours, 0),
      Object.values(job.days)
        .filter((day) => day.row === person.row && day.status === "submitted")
        .reduce((sum, day) => sum + day.hours, 0),
      person.total === null ? "需修正" : Math.max(0, person.total - done),
      person.issue ||
        person.assignment ||
        person.hourExplanation ||
        (done ? "已保存处理进度" : "待处理"),
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
    "hours-name-column",
    "hours-identity-column",
    "hours-value-column",
    "hours-scope",
    "hours-download-templates",
  ])
    el(id).disabled = running || refreshCount > 0;
  for (const input of el("hours-posts-list").querySelectorAll("input"))
    input.disabled = running || refreshCount > 0;
  el("hours-download-templates").disabled =
    running ||
    refreshCount > 0 ||
    !target?.posts?.length ||
    !selectedPosts().length;
  const uncertain = Object.entries(job.days).filter(
    ([, day]) => day.status === "unknown",
  );
  const validPeople = people.some(person => !person.issue);
  const startReason = running ? '正在处理当前批次。'
    : refreshCount > 0 ? '正在读取名单与保存进度，请稍候。'
    : !target ? '尚未连接目标项目，请先点击「重新检查」。'
    : !people.length ? '请先选择人员时长清单和工作表。'
    : !validPeople ? '当前名单没有可处理的人员，请先修正表格中的提示。'
    : !jobKey ? '尚未完成进度检查，请点击「重新检查」后重试。'
    : uncertain.length ? '请先核对下方「结果待核对」的提交，再继续录入。'
    : !proofFile ? '尚未预览证明图片：请点击「先预览证明图片」，核对图片后再开始。'
    : !el('hours-confirm').checked ? '请先勾选上方核对确认框，再点击开始。' : '';
  el('hours-start-hint').textContent = startReason || '准备就绪，可以开始录入。';
  el('hours-run').disabled = !!startReason;
  el('hours-run').title = startReason;
  el('hours-ready-preview').hidden = running || refreshCount > 0 || !target || !validPeople || !!proofFile || !!uncertain.length;
  el("hours-pause").disabled = !running || paused;
  el("hours-preview").disabled =
    running ||
    refreshCount > 0 ||
    !target ||
    !people.some((person) => !person.issue);
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
  el("hours-context-hint").textContent = "正在读取官网活动名称与服务日期…";
  target = null;
  render();
  target = await environment.readTarget("hours");
  if (!target.id) target = null;
  el("hours-target").textContent = target
    ? "团体 · " +
      target.name +
      " ｜ " +
      (target.activityName || "活动尾号 " + target.activityId.slice(-8)) +
      " · " +
      (target.postName || "岗位尾号 " + target.postId.slice(-8))
    : "请打开官网岗位的「计时 → 时长录入」，再点重新检查。";
  if (target) {
    const key = [target.id, target.activityId, target.postId].join("|");
    if (contextChoice.key && contextChoice.key !== key) {
      contextChoice = { key, activity: false, dates: false };
      el("hours-activity-name").value = "";
      el("hours-start").value = "";
      el("hours-end").value = "";
      notesEdited = false;
    }
    contextChoice.key = key;
    showPosts();
    if (target.activityName && !contextChoice.activity)
      el("hours-activity-name").value = target.activityName;
    if (target.dates?.length && !contextChoice.dates) {
      el("hours-start").value = target.dates[0];
      el("hours-end").value = target.dates.at(-1);
    }
    if (!notesEdited)
      el("hours-notes").value = defaultHourNotes(
        el("hours-activity-name").value,
      );
    invalidateProof();
    el("hours-context-hint").textContent =
      target.activityName && target.dates?.length
        ? "已自动读取活动名称与 " +
          target.dates.length +
          " 个官网服务日期，可直接使用或按实际服务情况调整。" +
          (contextChoice.activity || contextChoice.dates
            ? "已保留手动调整。"
            : "")
        : target.metadataReason || "部分信息未自动读到，可重新检查或手动补充。";
  } else
    el("hours-context-hint").textContent =
      "进入正确岗位后可自动读取活动名称与服务日期。";
  if (source) await refreshProgress();
  render();
}
async function loadProgress() {
  el("hours-confirm").checked = false;
  people = [];
  job = { days: {}, inFlight: null };
  jobKey = null;
  const selected = selectedSheet();
  fileError(selected?.issue || "");
  if (selected?.issue) {
    analysisSummary();
    status(selected.issue);
    return;
  }
  people = selected?.read() || [];
  analysisSummary();
  if (source && target && selected) {
    jobKey = await batchKey(
      "hours-project:" + JSON.stringify([target.id, target.activityId]),
      sheets[Number(el("hours-sheet").value)]?.name || "",
      source,
    );
    await navigator.locks.request(
      "member-import-running",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error("另一个录入面板正在处理，请在那个面板继续。");
        let saved = (await environment.storage.get(jobKey))[jobKey];
        saved ||= { days: {}, inFlight: null, migrated: [] };
        saved.migrated ||= [];
        const legacyPosts = [
          ...new Set([
            target.postId,
            ...(target.posts || []).map((post) => post.id),
          ]),
        ];
        for (const postId of legacyPosts) {
          const oldKey = await batchKey(
            "hours:" + JSON.stringify([target.id, target.activityId, postId]),
            selected.name,
            source,
          );
          if (saved.migrated.includes(oldKey)) continue;
          const old = (await environment.storage.get(oldKey))[oldKey];
          if (old) {
            if (
              (Object.keys(old.days || {}).length || old.inFlight) &&
              (old.mapping || selected.legacySignature) &&
              (old.mapping || selected.legacySignature) !== selected.signature()
            )
              throw Error(
                "原岗位进度的识别列与当前不同，请恢复原识别列后继续。",
              );
            mergeLegacyHourProgress(saved, old, postId);
          }
          saved.migrated.push(oldKey);
        }
        if (saved) {
          job = saved;
          const mapping = selected.signature();
          if (Object.keys(job.days || {}).length || job.inFlight) {
            const original = job.mapping || selected.legacySignature;
            if (original && original !== mapping) {
              people = [];
              analysisSummary();
              throw Error(
                "当前文件已保存处理进度，识别列与上次不同。为避免错认人员或重复录入，请恢复原识别列后继续。",
              );
            }
          }
          if (job.inFlight) {
            for (const entry of job.inFlight.entries || [job.inFlight])
              job.days[entry.key] = { ...entry, status: "unknown" };
            job.inFlight = null;
            await save();
          }
        }
        job.mapping = selected.signature();
        await save();
      },
    );
  }
  if (people.length)
    status(
      "名单识别已更新：可处理 " +
        people.filter((person) => !person.issue).length +
        " 人，需修正 " +
        people.filter((person) => person.issue).length +
        " 人。请核对原始时长和解析后小时数。",
    );
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
  });
el("hours-file").onchange = () =>
  safely(async () => {
    const revision = ++fileRevision;
    invalidateProof();
    fileError();
    people = [];
    sheets = [];
    configureColumns();
    source = null;
    jobKey = null;
    job = { days: {}, inFlight: null };
    el("hours-sheet").replaceChildren();
    el("hours-analysis").textContent = "";
    el("hours-confirm").checked = false;
    el("hours-run").disabled = true;
    const file = el("hours-file").files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      fileError("名单最多 8 MB。");
      throw Error("名单最多 8 MB。");
    }
    const bytes = await file.arrayBuffer();
    let loaded;
    try {
      loaded = await readHourSheets(bytes, Excel);
    } catch (error) {
      if (revision !== fileRevision) return;
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
    configureColumns();
    await refreshProgress();
    status(
      people.length
        ? "已读取 " +
            people.length +
            " 人。活动名称和日期已自动读取时可直接预览证明。"
        : selectedSheet()?.issue || "没有读到人员。",
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
    if (id === "hours-start" || id === "hours-end") contextChoice.dates = true;
    invalidateProof();
    safely(refreshProgress);
  };
el("hours-sheet").onchange = () => {
  configureColumns();
  invalidateProof();
  safely(refreshProgress);
};
for (const id of [
  "hours-name-column",
  "hours-identity-column",
  "hours-value-column",
])
  el(id).onchange = () => {
    const sheet = selectedSheet();
    if (!sheet) return;
    const [kind, value] = el("hours-identity-column").value.split(":");
    const patch = {
      name: el("hours-name-column").value,
      hours: el("hours-value-column").value,
    };
    if (kind !== "auto") {
      patch.volunteerId = kind === "volunteerId" ? value : 0;
      patch.card = kind === "card" ? value : 0;
    } else {
      patch.volunteerId = sheet.automaticFields.volunteerId || 0;
      patch.card = sheet.automaticFields.card || 0;
    }
    sheet.configure(patch);
    invalidateProof();
    safely(refreshProgress);
  };
el("hours-method").onchange = () => {
  el("hours-scope-label").hidden = method() !== "batch";
  el("hours-method-hint").textContent =
    method() === "batch"
      ? "默认读取整个项目全部岗位模板匹配人员，按岗位和日期提交上级审批。已提交审批不代表时长已生效。"
      : "自动逐人录入，避开已有记录的日期。";
  el("hours-confirm").checked = false;
  render();
};
el("hours-scope").onchange = () => {
  invalidateProof();
  render();
};
el("hours-download-templates").onclick = () =>
  safely(async () => {
    running = true;
    paused = false;
    render();
    try {
      await navigator.locks.request(
        "member-import-running",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw Error("另一个批次正在运行，请稍后下载模板。");
          const rosters = await projectTemplates(true),
            zip = new Zip();
          const safe = (value) =>
            String(value || "岗位")
              .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
              .slice(0, 70);
          rosters.forEach((roster, index) =>
            zip.file(
              String(index + 1).padStart(2, "0") +
                "_" +
                safe(roster.postName) +
                "_" +
                safe(roster.postId) +
                ".xlsx",
              roster.buffer,
            ),
          );
          downloadBlob(
            await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
            safe(el("hours-activity-name").value) + "_全部岗位官网模板.zip",
          );
          status("已下载 " + rosters.length + " 个岗位的官网原始模板 ZIP。");
        },
      );
    } finally {
      running = false;
      render();
    }
  });
el("hours-proof-mode").onchange = () => {
  el("hours-proof-upload").hidden = el("hours-proof-mode").value !== "upload";
  invalidateProof();
  render();
};
el("hours-activity-name").oninput = () => {
  contextChoice.activity = true;
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
    el('hours-proof-preview').scrollIntoView({block:'nearest'});
  });
el('hours-ready-preview').onclick = () => el('hours-preview').click();
el("hours-confirm").onchange = render;
el("hours-pause").onclick = () => {
  paused = true;
  status("当前这次提交完成后暂停。");
  render();
};
async function memberIdentity(number) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([target.id, target.activityId, number]),
    ),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function runProjectBatch() {
  const rosters = await projectTemplates(true),
    plans = [],
    owners = new Map();
  for (const person of people) {
    if (paused) break;
    if (person.issue || person.total <= completed(person)) continue;
    status("正在匹配项目全部岗位：原表第 " + person.row + " 行。");
    let candidates = projectHourCandidates(person, rosters);
    const memberships = new Map();
    if (person.identifier === "cert") {
      const found = new Set();
      for (const post of [
        ...new Map(
          candidates
            .flatMap((candidate) => candidate.posts)
            .map((post) => [post.id, post]),
        ).values(),
      ]) {
        const response = await projectSend({
          action: "member",
          postId: post.id,
          person,
        });
        if (response.status === "rejected") continue;
        if (!response.number || !Array.isArray(response.used))
          throw Error(response.reason || "官网身份和历史记录未完整返回。");
        if (
          candidates.some(
            (candidate) =>
              candidate.number === response.number &&
              candidate.posts.some((item) => item.id === post.id),
          )
        ) {
          found.add(response.number);
          memberships.set(post.id, response);
        }
      }
      candidates = candidates.filter((candidate) =>
        found.has(candidate.number),
      );
    }
    if (candidates.length !== 1) {
      person.issue = candidates.length
        ? "项目中有同名但不同编号的人员，请补充编号或证件号码。"
        : "未在所选岗位的完整模板中匹配到此人。";
      render();
      continue;
    }
    const candidate = candidates[0],
      identity = await memberIdentity(candidate.number);
    if (
      Object.values(job.days).some(
        (day) => day.identity === identity && day.row !== person.row,
      )
    ) {
      person.issue = "相同系统编号已在本表其他行处理，请核对重复人员。";
      render();
      continue;
    }
    const used = new Set(
      Object.values(job.days)
        .filter((day) => day.row === person.row)
        .map((day) => day.date),
    );
    let failed = false;
    for (const post of candidate.posts) {
      const response =
        memberships.get(post.id) ||
        (await projectSend({
          action: "member",
          postId: post.id,
          number: candidate.number,
          person:
            person.identifier === "cert"
              ? person
              : { identifier: "number", cert: candidate.number },
        }));
      if (response.status === "rejected") {
        person.issue =
          "模板名单与官网当前岗位成员不一致，已跳过此人，请重新下载核对。";
        failed = true;
        break;
      }
      if (response.number !== candidate.number || !Array.isArray(response.used))
        throw Error(response.reason || "官网历史日期未完整返回，已停止提交。");
      memberships.set(post.id, response);
      response.used.forEach((date) => used.add(date));
    }
    if (failed) {
      render();
      continue;
    }
    const post = candidate.posts[0],
      dates = hourDates(
        target.dates,
        el("hours-start").value,
        el("hours-end").value,
        el("hours-order").value === "desc",
      );
    const allocations = allocateHourDays(
      { ...person, cert: candidate.number },
      person.total - completed(person),
      dates,
      used,
    );
    const plan = {
      person,
      post,
      number: candidate.number,
      identity,
      allocations,
    };
    const previous = owners.get(identity);
    if (previous) {
      previous.duplicate = true;
      plan.duplicate = true;
      previous.person.issue = person.issue =
        "多条名单对应同一系统编号，已暂停这几行，请核对后去重。";
    } else owners.set(identity, plan);
    plans.push(plan);
    person.assignment =
      "已匹配岗位：" +
      post.name +
      (candidate.posts.length > 1
        ? "（该编号跨 " + candidate.posts.length + " 岗位，仅计算一次）"
        : "");
    const shortage =
      person.total -
      completed(person) -
      allocations.reduce((sum, allocation) => sum + allocation.hours, 0);
    if (shortage > 0)
      person.issue =
        "可用日期不足，剩余 " + shortage + " 小时待处理；已有日期已避开。";
    render();
  }
  if (paused) {
    status("已暂停，尚未提交新的项目审批。");
    return;
  }
  const groups = new Map();
  for (const plan of plans.filter((plan) => !plan.duplicate))
    for (const allocation of plan.allocations) {
      const key = plan.post.id + "|" + allocation.date;
      const group = groups.get(key) || {
        post: plan.post,
        date: allocation.date,
        records: [],
      };
      group.records.push({
        row: plan.person.row,
        name: plan.person.name,
        number: plan.number,
        identity: plan.identity,
        posts: projectHourCandidates(
          { ...plan.person, identifier: "number", cert: plan.number },
          rosters,
        )[0].posts,
        hours: allocation.hours,
      });
      groups.set(key, group);
    }
  const ordered = [...groups.values()].sort((a, b) => {
    const date =
      el("hours-order").value === "desc"
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date);
    return (
      date ||
      selectedPosts().findIndex((post) => post.id === a.post.id) -
        selectedPosts().findIndex((post) => post.id === b.post.id)
    );
  });
  const proof = await encodeFile(proofFile);
  for (const group of ordered) {
    if (paused) break;
    const { post, date, records } = group;
    for (const record of records) {
      for (const memberPost of record.posts) {
        const fresh = await projectSend({
          action: "member",
          postId: memberPost.id,
          number: record.number,
          person: { identifier: "number", cert: record.number },
        });
        if (fresh.number !== record.number || !Array.isArray(fresh.used))
          throw Error(fresh.reason || "提交前人员或历史日期未能核对。");
        if (fresh.used.includes(date))
          throw Error(
            "第 " +
              record.row +
              " 行 " +
              date +
              " 出现新记录，本日期未提交，请继续时重新分配。",
          );
      }
    }
    if (paused) break;
    status("正在准备岗位「" + post.name + "」 " + date + " 的官网模板。");
    const template = await projectSend({
      action: "template",
      postId: post.id,
      date,
    });
    if (!template.base64) throw Error(template.reason || "官网下载模板失败。");
    const bytes = await fillHourBatchTemplate(
      Uint8Array.from(atob(template.base64), (c) => c.charCodeAt(0)),
      records,
      date,
      Excel,
    );
    const file = await encodeFile(
      new File([bytes], "岗位时长_" + date + ".xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const parsed = await projectSend({
      action: "prepare",
      postId: post.id,
      date,
      records,
      file,
      proof,
      notes: el("hours-notes").value,
    });
    if (!parsed.ticket || parsed.count !== records.length)
      throw Error(parsed.reason || "官网未能完整解析本批，本批未提交。");
    if (paused) break;
    const entries = records.map((record) => ({
      key: record.row + "|" + post.id + "|" + date,
      row: record.row,
      postId: post.id,
      postName: post.name,
      date,
      hours: record.hours,
      identity: record.identity,
      method: "batch",
    }));
    job.inFlight = { entries };
    await save();
    status(
      "正在提交岗位「" +
        post.name +
        "」 " +
        date +
        " 的上级审批（" +
        records.length +
        " 人）。",
    );
    let response;
    try {
      response = await projectSend({
        action: "commit",
        postId: post.id,
        date,
        ticket: parsed.ticket,
      });
    } catch {
      response = {
        status: "unknown",
        reason: "项目审批连接中断，请核对官网导入记录。",
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
  status(
    paused
      ? "已暂停，项目已提交进度已保存。"
      : "项目全部所选岗位处理结束，已提交审批的时长等待上级审核；请查看未匹配和待处理人员。",
  );
}
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
        key: record.row + "|" + target.postId + "|" + date,
        postId: target.postId,
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
            (Object.keys(job.days || {}).length || job.inFlight) &&
            (job.mapping || selectedSheet().legacySignature) &&
            (job.mapping || selectedSheet().legacySignature) !==
              selectedSheet().signature()
          )
            throw Error("识别列与已有进度不同，请恢复原识别列后继续。");
          job.mapping = selectedSheet().signature();
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
            if (projectMode()) await runProjectBatch();
            else await runBatch();
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
            const identity = await memberIdentity(prepared.number);
            if (
              Object.values(job.days).some(
                (day) => day.identity === identity && day.row !== person.row,
              )
            ) {
              person.issue = "相同系统编号已在本表其他行处理，请核对重复人员。";
              render();
              continue;
            }
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
                key = person.row + "|" + target.postId + "|" + date;
              const entry = {
                key,
                row: person.row,
                postId: target.postId,
                date,
                hours: amount,
                identity,
              };
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
                  person: {
                    ...person,
                    identifier: "number",
                    cert: prepared.number,
                  },
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
