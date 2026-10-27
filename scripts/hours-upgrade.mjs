import fs from 'node:fs/promises';
import path from 'node:path';

// Run on every source sync, including unchanged timetable releases.
export async function applyHoursUpgrade(root,template,app){
 const feature=path.join(root,'features/hours'),output=path.join(root,'public');
 template=template.replace(/<!--HOURS-NAV-->[\s\S]*?<!--\/HOURS-NAV-->/g,'').replace(/<!--HOURS-HOME-->[\s\S]*?<!--\/HOURS-HOME-->/g,'');
 template=template.replace('</nav>','<!--HOURS-NAV--><a class="hours-nav-link" href="hours.html">◷ 志愿时长导入</a><!--/HOURS-NAV--></nav>');
 template=template.replace('<div class="office-utility">','<div class="office-utility"><!--HOURS-HOME--><a class="hours-home-link" href="hours.html">◷ 志愿时长导入</a><!--/HOURS-HOME-->');
 const style='<style id="hours-nav-css">.hours-nav-link{display:block;text-decoration:none;color:#bedbdc!important;padding:12px 14px;border:1px solid #a3c4ff30;border-radius:12px;font-size:14px;order:2}.hours-nav-link:hover,.hours-home-link:hover{background:#293957}.hours-home-link{display:inline-flex;align-items:center;border:1px solid #a3c4ff30;padding:10px 16px;border-radius:11px;text-decoration:none;color:#bfe5df!important;font-size:12px;background:#1a2b44}</style>';
 template=template.replace(/<style id="hours-nav-css">[\s\S]*?<\/style>/g,'').replace('</head>',style+'</head>');
 for(const name of ['core.mjs','io.mjs','hours-app.mjs','hours.css'])await fs.copyFile(path.join(feature,name),path.join(output,name));
 await fs.copyFile(path.join(feature,'index.html'),path.join(output,'hours.html'));
 await fs.cp(path.join(feature,'vendor'),path.join(output,'vendor'),{recursive:true});
 return {template,app};
}
