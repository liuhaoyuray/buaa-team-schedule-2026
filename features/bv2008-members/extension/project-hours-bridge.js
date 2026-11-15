(() => {
  if (globalThis.__buaaProjectHoursBridge) return;
  globalThis.__buaaProjectHoursBridge = true;
  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const tickets = new Map(),
    scopes = new Map();
  const native = globalThis.__buaaProjectNative;
  const numberOf = (row) => String(row.userNumber ?? "").trim();
  const hoursOf = (row) => Number(row.durationHour);
  function requireCurrent(target) {
    if (!native.current(target)) throw Error("当前活动或岗位已切换，已停止。");
    const stores =
      page.document.querySelector("#app")?.__vue_app__?.config?.globalProperties
        ?.$pinia?._s;
    const groups = [...(stores?.values() || [])]
      .filter((store) => "userInfo" in store)
      .map((store) => String(store.userInfo?.currOrgInfoActive?.orgId || ""));
    if (!groups.includes(target.id)) throw Error("当前团体或登录状态已改变。");
  }
  async function context(request) {
    requireCurrent(request.target);
    const api = await native.module();
    const read = (marker) => {
      const fn = Object.values(api).find(
        (value) =>
          typeof value === "function" &&
          Function.prototype.toString.call(value).includes(marker),
      );
      if (!fn) throw Error("官网接口已变化：" + marker.split("/").at(-1));
      return fn;
    };
    const key = request.target.id + "|" + request.target.activityId;
    let scope = scopes.get(key);
    if (!scope || Date.now() - scope.at > 60000) {
      const [details, dates] = await Promise.all([
        read("/activity/findDetailsByIid")({ iid: request.target.activityId }),
        read("/activityScheduling/getServerTimeByActivityId")({
          activityId: request.target.activityId,
        }),
      ]);
      const info = details?.data?.resultData?.dataMap?.details;
      if (
        !details?.success ||
        !dates?.success ||
        String(info?.iid) !== request.target.activityId ||
        !Array.isArray(info?.activityPostList) ||
        !Array.isArray(dates.data?.resultData)
      )
        throw Error("官网没有完整返回当前项目的岗位与服务日期。");
      scope = {
        at: Date.now(),
        posts: new Set(info.activityPostList.map((post) => String(post.iid))),
        dates: new Set(dates.data.resultData),
      };
      scopes.set(key, scope);
    }
    requireCurrent(request.target);
    if (request.postId && !scope.posts.has(request.postId))
      throw Error("目标岗位不属于当前项目。");
    if (request.date && !scope.dates.has(request.date))
      throw Error("目标日期不属于官网可录入的服务日期。");
    return { read, scope };
  }
  async function blobData(blob) {
    if (
      !blob ||
      typeof blob.arrayBuffer !== "function" ||
      !blob.size ||
      blob.size >= 10 * 1024 * 1024
    )
      throw Error("官网没有返回有效的模板文件。");
    if (/json|text\/html/.test(blob.type)) {
      let message;
      try {
        message = JSON.parse(await blob.text()).message;
      } catch {}
      throw Error(message || "官网下载模板失败。");
    }
    return new Promise((resolve, reject) => {
      const reader = new page.FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(Error("模板文件读取失败"));
      reader.readAsDataURL(blob);
    });
  }
  function file(data, proof = false) {
    if (!data?.base64 || typeof data.base64 !== "string")
      throw Error("缺少上传文件。");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.length >= (proof ? 3 : 10) * 1024 * 1024)
      throw Error("上传文件超过官网大小限制。");
    if (proof && !["image/png", "image/jpeg"].includes(data.type))
      throw Error("证明图片格式不正确。");
    return new page.File([bytes], data.name, { type: data.type });
  }
  function parsedRecords(rows, expected) {
    if (!Array.isArray(rows) || rows.length !== expected.length)
      throw Error("官网解析人数与本批不一致，本批未提交。");
    const byNumber = new Map(expected.map((row) => [row.number, row]));
    const seen = new Set();
    for (const row of rows) {
      const number = numberOf(row),
        match = byNumber.get(number);
      if (
        !match ||
        seen.has(number) ||
        !row.uid ||
        row.name !== match.name ||
        hoursOf(row) !== match.hours
      )
        throw Error("官网解析后的姓名、编号或时长不一致，本批未提交。");
      seen.add(number);
    }
  }
  document.addEventListener("buaa-hours-native-request", async (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!/^[\w-]{1,100}$/.test(request?.requestId || "")) return;
    let clicked = false;
    const reply = (value) =>
      document.dispatchEvent(
        new CustomEvent("buaa-hours-native-result", {
          detail: JSON.stringify({ requestId: request.requestId, ...value }),
        }),
      );
    try {
      const { read } = await context(request);
      const common = {
        activityId: request.target.activityId,
        postId: request.postId,
        orgId: request.target.id,
      };
      if (request.action === "template") {
        const blob = await read("/activityTiming/downloadImportTemplate")({
          activityId: common.activityId,
          postId: common.postId,
          time: request.date,
        });
        requireCurrent(request.target);
        reply({ base64: await blobData(blob) });
        return;
      }
      if (request.action === "member") {
        const query = { ...common, pageNo: 1, pageSize: 10 };
        if (request.person.identifier === "cert") {
          const key = await read("/safety/getInSm2Key")();
          if (!key?.success || !key.data?.pk)
            throw Error("官网身份检索公钥尚未就绪。");
          query.certNo = read(".sm2.doEncrypt")(
            request.person.cert,
            key.data.pk,
          );
        } else query.userNumber = request.number;
        const response = await read("/activityTiming/getTimingList")(query);
        const data = response?.data?.resultData;
        if (
          !response?.success ||
          !Array.isArray(data?.dataList) ||
          !Number.isFinite(Number(data.totalCount))
        )
          throw Error("官网人员检索未完成。");
        if (Number(data.totalCount) !== 1 || data.dataList.length !== 1) {
          reply({ status: "rejected", reason: "这个岗位未能唯一匹配该人员。" });
          return;
        }
        const row = data.dataList[0],
          number = numberOf(row);
        if (
          !number ||
          !row.uid ||
          (request.number && number !== request.number)
        ) {
          reply({
            status: "rejected",
            reason: "官网检索返回的志愿者编号不一致。",
          });
          return;
        }
        const history = await read("/activityTiming/getDurationRecordInfoList")(
          { ...common, uid: row.uid },
        );
        if (
          !history?.success ||
          !Array.isArray(history.data?.resultData?.dataList)
        )
          throw Error("官网历史时长记录未完整返回，已停止。");
        requireCurrent(request.target);
        const records = history.data.resultData.dataList.filter((entry) =>
          /^\d{4}-\d{2}-\d{2}$/.test(String(entry.time || "")),
        );
        const occupied = [],
          empty = [];
        for (const entry of records) {
          const raw = entry.durationHour;
          const amount =
            raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
          if (!Number.isFinite(amount) || amount < 0)
            throw Error("官网历史时长数值无法识别，已停止，未提交。");
          // The native calendar also returns zero-hour placeholders for unused days.
          // A date by itself is not an existing service-hours record.
          const hasEvidence = [entry.notes, entry.filePath].some(
            (value) => typeof value === "string" && value.trim(),
          );
          (amount > 0 || hasEvidence ? occupied : empty).push(
            String(entry.time),
          );
        }
        reply({
          number,
          used: [...new Set(occupied)],
          empty: [...new Set(empty)].filter((date) => !occupied.includes(date)),
        });
        return;
      }
      if (request.action === "prepare") {
        if (
          !Array.isArray(request.records) ||
          !request.records.length ||
          request.records.length > 500 ||
          request.records.some(
            (row) =>
              !row.number ||
              !row.name ||
              !(
                row.hours >= 0.5 &&
                row.hours <= 8 &&
                (row.hours * 2) % 1 === 0
              ),
          )
        )
          throw Error("本批人员或时长不符合要求。");
        const response = await read("/activityTiming/importDurationExcel")({
          file: file(request.file),
          activityId: common.activityId,
          postId: common.postId,
          time: request.date,
        });
        const data = response?.data?.resultData;
        if (
          !response?.success ||
          !data ||
          !Array.isArray(data.skipped) ||
          !Array.isArray(data.rows)
        )
          throw Error(response?.message || "官网模板解析失败，本批未提交。");
        if (data.skipped.length)
          throw Error(
            "官网有 " +
              data.skipped.length +
              " 行校验未通过，本批未提交。" +
              [
                ...new Set(
                  data.skipped.map((row) => row.reason).filter(Boolean),
                ),
              ]
                .slice(0, 3)
                .join("；"),
          );
        parsedRecords(data.rows, request.records);
        const upload = await read("/file/uploadTemp")({
          file: file(request.proof, true),
          uploadType: "durationFile",
        });
        const filePath = (upload?.data || upload)?.resultData?.fileData
          ?.newName;
        if (!upload?.success || !filePath)
          throw Error("证明图片尚未上传成功，本批未提交。");
        requireCurrent(request.target);
        for (const [id, ticket] of tickets)
          if (Date.now() - ticket.at > 600000) tickets.delete(id);
        const ticket = crypto.randomUUID();
        tickets.set(ticket, {
          at: Date.now(),
          target: request.target,
          postId: request.postId,
          date: request.date,
          rows: data.rows,
          filePath,
          notes: String(request.notes || "").slice(0, 600),
        });
        reply({ ticket, count: data.rows.length });
        return;
      }
      if (request.action === "commit") {
        const ticket = tickets.get(request.ticket);
        if (
          !ticket ||
          Date.now() - ticket.at > 600000 ||
          ticket.target.id !== request.target.id ||
          ticket.target.activityId !== common.activityId ||
          ticket.postId !== request.postId ||
          ticket.date !== request.date
        )
          throw Error("本批解析状态已失效，请重新准备。");
        tickets.delete(request.ticket);
        requireCurrent(request.target);
        clicked = true;
        const response = await read("/activityTiming/batchSubmitDuration")({
          activityId: common.activityId,
          postId: ticket.postId,
          time: ticket.date,
          notes: ticket.notes,
          filePath: ticket.filePath,
          rows: ticket.rows,
        });
        requireCurrent(request.target);
        reply(
          response?.success
            ? { status: "submitted", reason: "申请已提交，等待上级团体审批" }
            : {
                status: "unknown",
                reason:
                  response?.message ||
                  "未能确认本批审批申请结果，请核对官网导入记录。",
              },
        );
        return;
      }
      throw Error("不支持的项目操作。");
    } catch (error) {
      reply({
        status: clicked ? "unknown" : "blocked",
        reason: error.message || "项目时长操作失败",
      });
    }
  });
})();
