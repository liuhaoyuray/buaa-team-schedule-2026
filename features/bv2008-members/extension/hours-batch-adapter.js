(() => {
  if (globalThis.__buaaHoursBatchAdapter) return;
  const {
    clean,
    visible,
    find,
    enabled,
    waitStable,
    timing,
    isLoading,
    submitAndWait,
  } = globalThis.__buaaMemberAdapter;
  const { target, changed, close, scanDates, getProof } =
    globalThis.__buaaHoursAdapter;
  const { displayedValue } = globalThis.__buaaActivityAdapter;
  const dialog = () =>
    [...document.querySelectorAll('.ant-modal,[role="dialog"]')].find(
      (form) => visible(form) && find(form, ".ant-modal-title", "批量导入时长"),
    );
  let prepared = null;
  function upload(input, file) {
    if (!input) throw Error("无法识别官网上传入口。");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function fileFrom(data) {
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    return new File([bytes], data.name, { type: data.type });
  }
  async function captureTemplate(button) {
    const id = crypto.randomUUID();
    let receive, timer;
    try {
      return await new Promise((resolve, reject) => {
        receive = (event) => {
          let data;
          try {
            data = JSON.parse(event.detail);
          } catch {
            return;
          }
          if (data.id !== id) return;
          data.error ? reject(Error(data.error)) : resolve(data.base64);
        };
        document.addEventListener("buaa-hours-template-result", receive);
        document.dispatchEvent(
          new CustomEvent("buaa-hours-template-capture", { detail: id }),
        );
        timer = setTimeout(
          () => reject(Error("官网模板尚未下载成功，请稍后重试。")),
          timing.page,
        );
        button.click();
      });
    } finally {
      clearTimeout(timer);
      document.removeEventListener("buaa-hours-template-result", receive);
      document.dispatchEvent(new Event("buaa-hours-template-cancel"));
    }
  }
  async function verifyParsed(form, records) {
    const ready = await waitStable(
      () => {
        const text = clean(form.querySelector(".parse-alert")?.textContent);
        const count = text.match(/解析成功(\d+)行.*校验未通过(\d+)行/);
        return count && !isLoading(form) ? count : null;
      },
      timing.search,
      500,
    );
    if (!ready) throw Error("官网尚未完成模板解析，未提交审批。");
    if (Number(ready[2])) {
      const failures = [...form.querySelectorAll(".result-block")].find(
        (block) =>
          clean(block.querySelector(".result-title")?.textContent).startsWith(
            "校验未通过数据",
          ),
      );
      const reasons = [
        ...new Set(
          [...(failures?.querySelectorAll("tbody tr[data-row-key]") || [])]
            .map((row) => displayedValue(failures, row, "失败原因"))
            .filter(Boolean),
        ),
      ].slice(0, 3);
      throw Error(
        "官网提示有 " +
          ready[2] +
          " 行校验未通过，本日期整批未提交。" +
          (reasons.length
            ? "原因：" + reasons.join("；")
            : "请核对名单和该日期的官网记录后重试。"),
      );
    }
    if (Number(ready[1]) !== records.length)
      throw Error("官网解析人数与本批不一致，未提交审批。");
    const successBlock = () =>
      [...form.querySelectorAll(".result-block")].find((block) =>
        clean(block.querySelector(".result-title")?.textContent).startsWith(
          "成功数据",
        ),
      );
    let block = successBlock();
    if (!block) throw Error("无法读取官网解析后的成功名单，未提交审批。");
    const expected = new Map(
      records.map((record) => [record.number, record.hours]),
    );
    const seen = new Set();
    for (let page = 0; page <= 100; page++) {
      const rows = [...block.querySelectorAll("tbody tr[data-row-key]")].filter(
        visible,
      );
      if (!rows.length) throw Error("官网解析名单仍在加载。");
      for (const row of rows) {
        const number = displayedValue(block, row, "志愿者编号");
        const amount = Number(
          displayedValue(
            block,
            row,
            "录入时长(小时)",
            "录入时长（小时）",
            "录入时长",
            "导入时长",
          ),
        );
        if (
          !expected.has(number) ||
          seen.has(number) ||
          amount !== expected.get(number)
        )
          throw Error("官网解析后的编号或时长不一致，未提交审批。");
        seen.add(number);
      }
      if (seen.size === records.length) return;
      const next = block.querySelector(".ant-pagination-next");
      const button = next?.querySelector("button") || next;
      if (
        !button ||
        next.classList.contains("ant-pagination-disabled") ||
        !enabled(button)
      )
        break;
      const previous = rows.map((row) => row.dataset.rowKey).join("|");
      button.click();
      const nextBlock = await waitStable(() => {
        const current = successBlock();
        return current &&
          !isLoading(current) &&
          [...current.querySelectorAll("tbody tr[data-row-key]")]
            .map((row) => row.dataset.rowKey)
            .join("|") !== previous
          ? current
          : null;
      }, timing.page);
      if (!nextBlock) break;
      block = nextBlock;
    }
    throw Error("未能完整核对官网解析名单，未提交审批。");
  }
  async function handle(message) {
    let form = dialog(),
      clicked = false;
    try {
      if (message.type === "hours-batch-close") {
        prepared = null;
        if (form) await close(form);
        return { ok: true };
      }
      if (changed(message.target) || !target().id)
        throw Error("目标岗位已改变。");
      if (message.type === "hours-batch-template") {
        if (form) throw Error("请先关闭官网已打开的批量导入弹窗。");
        const page = [...document.querySelectorAll(".DurationInputList")].find(
          visible,
        );
        const button = page && find(page, "button", "批量导入时长");
        if (
          !(await waitStable(
            () => enabled(button) && !isLoading(page),
            timing.page,
          ))
        )
          throw Error("官网批量导入入口尚未就绪。");
        button.click();
        form = await waitStable(
          () => (dialog() && !isLoading(dialog()) ? dialog() : null),
          timing.page,
        );
        if (!form) throw Error("批量导入弹窗仍在加载。");
        const selected = await scanDates(form, message.date);
        if (!selected.selected) throw Error("服务日期不可选。");
        const download = find(form, "button", "下载模板");
        if (!(await waitStable(() => enabled(download), timing.page)))
          throw Error("官网模板下载尚未就绪。");
        const base64 = await captureTemplate(download);
        prepared = { form, date: message.date, target: message.target };
        return { base64 };
      }
      if (message.type !== "hours-batch-submit") return null;
      if (
        !form ||
        prepared?.form !== form ||
        prepared.date !== message.date ||
        changed(prepared.target)
      )
        throw Error("批量导入状态已变化，请重新开始本批。");
      if (
        !message.records?.length ||
        message.records.length > 500 ||
        !getProof()
      )
        throw Error("名单或证明缺失。");
      const inputs = [...form.querySelectorAll('input[type="file"]')];
      const template = inputs.find((input) => /xlsx/i.test(input.accept));
      const proofInput = inputs.find((input) =>
        /jpg|jpeg|png/i.test(input.accept),
      );
      upload(template, fileFrom(message.file));
      await verifyParsed(form, message.records);
      const notes = form.querySelector("textarea");
      if (notes) {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        ).set.call(notes, message.notes || "");
        notes.dispatchEvent(new Event("input", { bubbles: true }));
      }
      upload(proofInput, fileFrom(getProof()));
      if (
        !(await waitStable(
          () =>
            form.querySelector(".annex-preview") &&
            !isLoading(form) &&
            enabled(find(form, "button", "提交审批")),
          timing.submit,
        ))
      )
        throw Error("证明材料仍未上传成功，尚未提交审批。");
      const selectedDate = form.querySelector(".ant-select-selection-item");
      if (
        changed(message.target) ||
        clean(selectedDate?.textContent) !== message.date
      )
        throw Error("提交前日期或岗位已变化。");
      clicked = true;
      const result = await submitAndWait(
        form,
        find(form, "button", "提交审批"),
        () => changed(message.target),
        (element, text) => {
          if (
            element.matches(".ant-message-success") ||
            element.querySelector(".ant-message-success") ||
            /申请已提交|请等待上级团体审批/.test(text)
          )
            return { status: "added", reason: "申请已提交，等待上级团体审批" };
          return null;
        },
      );
      prepared = null;
      return result?.status === "added"
        ? { status: "submitted", reason: result.reason }
        : {
            status: "unknown",
            reason: "未能确认审批申请结果，请先核对官网导入记录。",
          };
    } catch (error) {
      prepared = null;
      if (!clicked && form) await close(form);
      return {
        status: clicked ? "unknown" : "blocked",
        reason: error.message || "批量导入暂不可用",
      };
    }
  }
  globalThis.__buaaHoursBatchAdapter = { handle };
})();
