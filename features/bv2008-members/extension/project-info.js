(() => {
  if (globalThis.__buaaProjectInfoBridge) return;
  globalThis.__buaaProjectInfoBridge = true;
  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const importNative =
    typeof unsafeWindow === "undefined"
      ? (url) => import(url)
      : (url) => page.Function("url", "return import(url)")(url);
  let modulePromise;
  async function nativeModule() {
    const urls = [
      ...page.document.querySelectorAll(
        'script[src],link[rel="modulepreload"][href]',
      ),
    ]
      .map((node) => node.src || node.href)
      .concat(
        page.performance
          ?.getEntriesByType("resource")
          .map((entry) => entry.name) || [],
      );
    const url = urls.find((value) => {
      try {
        const candidate = new URL(value, page.location.href);
        return (
          candidate.origin === page.location.origin &&
          /^\/js\/bootstrap-[\w-]+\.js$/.test(candidate.pathname)
        );
      } catch {
        return false;
      }
    });
    if (!url) throw Error("尚未找到官网已加载的项目信息模块");
    modulePromise ||= importNative(url).catch((error) => {
      modulePromise = null;
      throw error;
    });
    return modulePromise;
  }
  const current = (request) => {
    const [path, query] = page.location.hash.split("?");
    const params = new URLSearchParams(query);
    return (
      path === "#/projectActivityManage/myProject/durationInput" &&
      params.get("activityId") === request.activityId &&
      params.get("postId") === request.postId
    );
  };
  document.addEventListener("buaa-hours-project-request", async (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!/^[\w-]{1,100}$/.test(request?.requestId || "") || !current(request))
      return;
    const reply = (value) =>
      document.dispatchEvent(
        new CustomEvent("buaa-hours-project-result", {
          detail: JSON.stringify({ requestId: request.requestId, ...value }),
        }),
      );
    try {
      const api = await nativeModule();
      const reader = (marker) =>
        Object.values(api).find(
          (value) =>
            typeof value === "function" &&
            Function.prototype.toString.call(value).includes(marker),
        );
      const details = reader("/activity/findDetailsByIid");
      const dates = reader("/activityScheduling/getServerTimeByActivityId");
      if (!details || !dates) throw Error("官网项目信息入口已变化");
      // Reuse the site's authenticated read operations; never expose its session credentials.
      const results = await Promise.allSettled([
        details({ iid: request.activityId }),
        dates({ activityId: request.activityId }),
      ]);
      if (!current(request)) throw Error("当前活动已改变");
      const detailResponse =
        results[0].status === "fulfilled" ? results[0].value : null;
      const dateResponse =
        results[1].status === "fulfilled" ? results[1].value : null;
      const info = detailResponse?.success
        ? detailResponse.data?.resultData?.dataMap?.details
        : null;
      if (info?.iid && String(info.iid) !== request.activityId)
        throw Error("官网返回的活动与当前活动不一致");
      const activityName = String(info?.activityName || "")
        .trim()
        .slice(0, 100);
      const post = info?.activityPostList?.find(
        (post) => String(post.iid) === request.postId,
      );
      const serviceDates =
        dateResponse?.success && Array.isArray(dateResponse.data?.resultData)
          ? dateResponse.data.resultData
          : [];
      reply({
        activityName,
        postName: String(post?.postName || "").slice(0, 100),
        dates: [
          ...new Set(
            serviceDates.filter(
              (date) =>
                typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
            ),
          ),
        ].sort(),
        reason:
          !activityName || !serviceDates.length
            ? "官网信息未完整返回，可重新读取或手动补充。"
            : "",
      });
    } catch (error) {
      reply({ reason: error.message || "项目信息暂时无法自动读取" });
    }
  });
})();
