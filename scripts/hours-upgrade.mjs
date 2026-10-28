import fs from 'node:fs/promises';
import path from 'node:path';

// Run on every source sync, including unchanged timetable releases.
export async function applyHoursUpgrade(root,template,app){
 const feature=path.join(root,'features/hours'),output=path.join(root,'public');
 template=template.replace(/<!--HOURS-NAV-->[\s\S]*?<!--\/HOURS-NAV-->/g,'').replace(/<!--HOURS-HOME-->[\s\S]*?<!--\/HOURS-HOME-->/g,'').replace(/<!--HOURS-VIEW-->[\s\S]*?<!--\/HOURS-VIEW-->/g,'');
 const nav='<button data-view="hours"><span class="nav-icon" aria-hidden="true">◷</span>志愿时长</button>';
 const view='<section id="hoursView" class="view" aria-label="志愿时长"><iframe id="hoursFrame" src="hours.html?embedded=1" title="志愿时长导入" loading="lazy"></iframe></section>';
 template=template.replace('<nav aria-label="主导航">','<nav aria-label="主导航"><!--HOURS-NAV-->'+nav+'<!--/HOURS-NAV-->');
 template=template.replace('<section id="queryView"','<!--HOURS-VIEW-->'+view+'<!--/HOURS-VIEW--><section id="queryView"');
 const style='<style id="hours-nav-css">aside nav [data-view="hours"]{order:2}aside nav [data-view="query"]{order:3}aside nav [data-view="colleges"]{order:4}aside nav [data-view="duty"]{order:5}.office-home-links{grid-template-columns:repeat(4,minmax(0,1fr))}body[data-workspace-view="hours"] .page-head{display:none}#hoursFrame{border:0;width:100%;min-height:850px;display:block;background:transparent}@media(max-width:1100px){.office-home-links{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:850px){.office-home-links{grid-template-columns:1fr}}</style>';
 template=template.replace(/<style id="hours-nav-css">[\s\S]*?<\/style>/g,'').replace('</head>',style+'</head>');
 if(!app.includes('"hours":['))app=app.replace('const titles={','const titles={"hours":["志愿时长","按岗位匹配人员，生成每天可导入的文件。"],');
 app=app.replaceAll('匹配人员名单，生成可按模板和日期导入的文件。','按岗位匹配人员，生成每天可导入的文件。');
 app=app.replace(/\n\/\* HOURS_FRAME_START \*\/[\s\S]*?\/\* HOURS_FRAME_END \*\//g,'');
 app+='\n/* HOURS_FRAME_START */\nwindow.addEventListener("message",e=>{const f=document.getElementById("hoursFrame");if(f&&e.source===f.contentWindow&&e.origin===location.origin&&e.data?.type==="hours-height"&&Number.isFinite(e.data.height))f.style.height=Math.min(30000,Math.max(650,e.data.height))+"px";});\n/* HOURS_FRAME_END */';
 for(const name of ['core.mjs','io.mjs','hours-app.mjs','hours.css'])await fs.copyFile(path.join(feature,name),path.join(output,name));
 await fs.copyFile(path.join(feature,'index.html'),path.join(output,'hours.html'));
 await fs.cp(path.join(feature,'vendor'),path.join(output,'vendor'),{recursive:true});
 return {template,app};
}
