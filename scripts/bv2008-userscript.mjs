import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeUserscript(root, output) {
  const feature = path.join(root, 'features/bv2008-members');
  const extension = path.join(feature, 'extension');
  const read = async (dir, file) => (await fs.readFile(path.join(dir, file), 'utf8')).replaceAll('\r\n', '\n');
  const moduleBody = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '').replace(/^export /gm, '');
  const hours = path.join(root, 'features/hours');
  const library = await read(path.join(hours, 'vendor'), 'exceljs-4.4.0.min.js');
  const adapter = (await Promise.all(['group-state.js', 'bv2008.js', 'activity.js', 'hours-adapter.js'].map(file => read(extension, file)))).join('\n');
  const logic = (await Promise.all(['core.mjs', 'io.mjs'].map(file => read(hours, file)))).map(moduleBody).join('\n') +
    '\n' + moduleBody(await read(extension, 'queue.mjs')) + '\n' + moduleBody(await read(extension, 'hours-core.mjs'));
  let app = moduleBody(await read(extension, 'app.mjs'));
  app = app.replace("  document.title = '志愿北京 · 批量添加活动志愿者';", '');
  app = app.replace(/get\('target-hint'\)\.textContent = '[^']*';/, "get('target-hint').textContent = '在官网展开目标活动，在对应岗位点「招募」，进入「已录用」后点重新检查。';");
  app = app.replace("load(connect);", `get('go-site').textContent = '前往对应官网页面';
if (!forActivity) {
  get('target-hint').textContent = '在左侧进入「志愿者管理 → 我的成员 → 正式成员」，再点重新检查。';
}
load(connect);`);
  const html = (await read(extension, 'index.html')).match(/<body>([\s\S]*)<\/body>/)[1];
  const hoursHtml = (await read(extension, 'hours.html')).match(/<body>([\s\S]*)<\/body>/)[1];
  const hoursApp = moduleBody(await read(extension, 'hours-app.mjs'));
  const css = (await read(extension, 'app.css')).replaceAll(':root', ':host') +
    '\n#buaa-panel { width: min(820px, calc(100vw - 36px)); max-height: calc(100vh - 95px); overflow: auto; border: 1px solid #a6b8cc; border-radius: 10px; background: #f1f5fa; box-shadow: 0 5px 30px #14273a40; }' +
    '\nmain { padding: 12px 16px 22px; } h1 { font-size: 1.75rem; } .card { padding: 14px; } .buaa-close { position: sticky; top: 8px; display: block; margin: 8px 12px 0 auto; z-index: 2; }' +
    '\n#buaa-launcher { box-shadow: 0 3px 12px #14273a40; } .table-wrap { max-height: 260px; }';
  const shell = (await read(feature, 'userscript-shell.js'))
    .replace("/*__PANEL_HTML__*/''", () => JSON.stringify(html))
    .replace("/*__PANEL_CSS__*/''", () => JSON.stringify(css))
    .replace('/*__PANEL_APP__*/', () => app)
    .replace("/*__HOURS_HTML__*/''", () => JSON.stringify(hoursHtml))
    .replace('/*__HOURS_APP__*/', () => hoursApp);
  const license = (await read(path.join(hours, 'vendor'), 'exceljs-LICENSE.txt')).split('\n').map(line => '// ' + line).join('\n');
  const header = `// ==UserScript==
// @name         志愿北京 · 批量录入助手
// @namespace    buaa-volunteer-tools
// @version      0.4.0
// @description  按 Excel 名单添加团体和活动志愿者，逐人录入时长并避开历史日期，支持进度恢复。
// @match        https://www.bv2008.cn/*
// @match        https://bv2008.cn/*
// @match        https://test1.bv2008.cn/*
// @homepageURL  https://liuhaoyuray.github.io/buaa-team-schedule-2026/bv2008-members.html
// @updateURL    https://liuhaoyuray.github.io/buaa-team-schedule-2026/bv2008-batch-helper.meta.js
// @downloadURL  https://liuhaoyuray.github.io/buaa-team-schedule-2026/bv2008-batch-helper.user.js
// @run-at       document-idle
// @noframes
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==
${license}
`;
  const code = header + '\n(async () => {\n"use strict";\nconst ExcelJS = (() => { const module = {exports: {}}; const exports = module.exports;\n' +
    library + '\nreturn module.exports; })();\n' + adapter + '\n' + logic + '\n' + shell + '\n})();\n';
  await fs.writeFile(path.join(output, 'bv2008-batch-helper.user.js'), code);
  await fs.writeFile(path.join(output, 'bv2008-batch-helper.meta.js'), header.split('// ==/UserScript==')[0] + '// ==/UserScript==\n');
}
