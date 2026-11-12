(() => {
  if (globalThis.__buaaTemplateBridge) return;
  globalThis.__buaaTemplateBridge = true;
  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  let cancel = () => {};
  document.addEventListener("buaa-hours-template-capture", (event) => {
    cancel();
    const id = String(event.detail || "");
    if (
      !/^[\w-]{1,100}$/.test(id) ||
      !page.location.hash.startsWith(
        "#/projectActivityManage/myProject/durationInput?",
      )
    )
      return;
    const create = page.URL.createObjectURL;
    const click = page.HTMLAnchorElement.prototype.click;
    const blobs = new Map();
    const restore = () => {
      clearTimeout(timer);
      if (page.URL.createObjectURL === capture)
        page.URL.createObjectURL = create;
      if (page.HTMLAnchorElement.prototype.click === intercept)
        page.HTMLAnchorElement.prototype.click = click;
      blobs.clear();
    };
    const capture = function (blob) {
      const url = create.call(this, blob);
      if (
        blob?.size > 0 &&
        blob.size < 10 * 1024 * 1024 &&
        blob.type !== "application/json"
      )
        blobs.set(url, blob);
      return url;
    };
    const intercept = function () {
      const blob = blobs.get(this.href);
      if (!blob) return click.call(this);
      restore();
      const reader = new page.FileReader();
      reader.onload = () =>
        document.dispatchEvent(
          new CustomEvent("buaa-hours-template-result", {
            detail: JSON.stringify({
              id,
              base64: String(reader.result).split(",")[1],
            }),
          }),
        );
      reader.onerror = () =>
        document.dispatchEvent(
          new CustomEvent("buaa-hours-template-result", {
            detail: JSON.stringify({ id, error: "模板读取失败" }),
          }),
        );
      reader.readAsDataURL(blob);
    };
    const timer = setTimeout(restore, 45000);
    cancel = restore;
    page.URL.createObjectURL = capture;
    page.HTMLAnchorElement.prototype.click = intercept;
  });
  document.addEventListener("buaa-hours-template-cancel", () => cancel());
})();
