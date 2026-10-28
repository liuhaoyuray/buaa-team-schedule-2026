import fs from 'node:fs/promises';
import path from 'node:path';

export async function applyPlatformUI(root,template,app){
 const css=await fs.readFile(path.join(root,'features/platform/night-theme.css'),'utf8');
 template=template.replace(/<style id="buaa-night-theme">[\s\S]*?<\/style>\s*/g,'');
 template=template.replace('</head>','<style id="buaa-night-theme">\n'+css+'\n</style>\n</head>');
 template=template.replace(/<body([^>]*)>/,(_,attrs)=>'<body'+attrs.replace(/\sdata-platform-theme="[^"]*"/g,'')+' data-platform-theme="night">');
 template=template.replace(/<title>[\s\S]*?<\/title>/,'<title>北航 · 志工实践工作台</title>');
 template=template.replace(/<div class="brand-mark">[\s\S]*?<\/div>/,'<div class="brand-mark"><img src="buaa-emblem.png" alt="北航校徽"></div>');
 template=template.replace('<strong>人员课表查询</strong>','<strong>志工 · 实践</strong>').replace('<small>2026年秋季学期</small>','<small>2026 AUTUMN · 工作台</small>');
 template=template.replace('北航校团委 · 志工部 / 实践部</p>','BUAA · 校团委 / 两部门工作台</p>');
 app=app.replace("clear?'切换玻璃效果':'切换清晰模式'","clear?'恢复氛围效果':'切换高对比'");
 app=app.replace("frame.src='lottery.html'","frame.src='lottery.html?v=20261024-64'");
 app=app.replace('hsl(157 39% ${96-31*free/Math.max(total,1)}%)','hsl(174 37% ${13+22*free/Math.max(total,1)}%)');
 app=app.replace('function setupGlass(){\n //','function setupGlass(){\n if(document.body.dataset.platformTheme===\'night\')return;\n //');
 return {template,app};
}
