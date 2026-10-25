import fs from 'node:fs/promises';
import path from 'node:path';
export async function applyOfficeUpgrade(root,template,app){
 const dir=path.join(root,'features/office');const [office,colleges,css,js,data]=await Promise.all(['office.html','colleges.html','office.css','office.js','colleges.json'].map(n=>fs.readFile(path.join(dir,n),'utf8')));
 template=template.replace(/<!--OFFICE-VIEWS-->[\s\S]*?<!--\/OFFICE-VIEWS-->/g,'').replace(/<!--OFFICE-NAV-->[\s\S]*?<!--\/OFFICE-NAV-->/g,'').replace(/<style id="office-upgrade-css">[\s\S]*?<\/style>\s*/g,'');
 template=template.replace('<nav aria-label="主导航">','<nav aria-label="主导航"><!--OFFICE-NAV--><button data-view="office"><span class="nav-icon">▤</span>报销台账</button><button data-view="colleges"><span class="nav-icon">⌕</span>学院系号</button><!--/OFFICE-NAV-->');
 template=template.replace('<section id="queryView"','<!--OFFICE-VIEWS-->'+office+colleges+'<!--/OFFICE-VIEWS--><section id="queryView"');
 template=template.replace('</head>','<style id="office-upgrade-css">'+css+'</style></head>');
 app=app.replace(/\n\/\* OFFICE_UPGRADE_START \*\/[\s\S]*?\/\* OFFICE_UPGRADE_END \*\//g,'');
 if(!app.includes('"office":["报销台账"'))app=app.replace('const titles={','const titles={"office":["报销台账","登录私密云台账，分类整理材料，跟进每笔办理进度。"],"colleges":["学院系号","按系号或名称查询，确认后快速复制。"],');
 app+='\n/* OFFICE_UPGRADE_START */\n'+js.replace('/*__COLLEGE_DATA__*/',()=>data)+'\n/* OFFICE_UPGRADE_END */';
 return {template,app};
}
