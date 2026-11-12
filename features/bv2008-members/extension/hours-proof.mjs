export async function makeHourProof({
  activity,
  group,
  start,
  end,
  notes,
  people,
}) {
  const records = people.filter((person) => !person.issue);
  if (!activity.trim() || !records.length)
    throw Error("请先填写活动名称并导入有效的人员时长。");
  const columns = records.length > 120 ? 2 : 1;
  const perColumn = Math.ceil(records.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 510 + perColumn * 36;
  const context = canvas.getContext("2d");
  if (!context) throw Error("当前浏览器无法生成图片，请改为上传证明。");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const draw = (value, x, y, size = 24, width = 1280, color = "#17253a") => {
    context.fillStyle = color;
    context.font = size + 'px "Microsoft YaHei", sans-serif';
    context.fillText(String(value), x, y, width);
  };
  draw("志愿服务时长汇总单", 60, 75, 40);
  draw("活动：" + activity.trim(), 60, 128, 28);
  draw("团体：" + group, 60, 174);
  draw("实际服务期间：" + start + " 至 " + end, 60, 216);
  draw(
    "拟录入：" +
      records.length +
      " 人，共 " +
      records.reduce((sum, person) => sum + person.total, 0) +
      " 小时",
    60,
    258,
  );
  // This is a summary of supplied records; no signature, seal or approval is invented.
  draw(
    "本单根据导入名单整理，服务内容及实际工时由经办人核对。",
    60,
    300,
    22,
    1280,
    "#465d74",
  );
  const columnWidth = 1280 / columns;
  for (let column = 0; column < columns; column++) {
    const x = 60 + column * columnWidth;
    draw("序号", x, 354, 22);
    draw("志愿者姓名", x + 80, 354, 22);
    draw("拟录入总时长", x + columnWidth - 170, 354, 22);
  }
  records.forEach((person, index) => {
    const column = Math.floor(index / perColumn),
      row = index % perColumn;
    const x = 60 + column * columnWidth,
      y = 398 + row * 36;
    draw(index + 1, x, y, 22, 65);
    draw(person.name, x + 80, y, 24, columnWidth - 275);
    draw(person.total + " 小时", x + columnWidth - 165, y, 24, 155);
  });
  const bottom = 435 + perColumn * 36;
  draw("备注：" + (notes || ""), 60, bottom, 21, 1280);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob || blob.size >= 3 * 1024 * 1024)
    throw Error("生成图片超过 3 MB，请减少本批人数或上传证明图片。");
  return new File([blob], "志愿服务时长汇总单.png", { type: "image/png" });
}
