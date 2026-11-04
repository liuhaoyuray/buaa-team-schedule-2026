import fs from 'node:fs/promises';import path from 'node:path';
export async function applyAwardsUpgrade(root,template,app){
 template=template.replace(/<!--AWARDS-START-->[\s\S]*?<!--AWARDS-END-->/g,'');
 template=template.replace('<section id="queryView"','<!--AWARDS-START--><section id="awardsView" class="view" aria-label="志愿服务荣誉库"><iframe class="awards-frame" title="志愿服务荣誉库" src="awards/index.html" loading="lazy" style="width:100%;height:1100px;border:0;border-radius:14px"></iframe></section><!--AWARDS-END--><section id="queryView"');
 if(!app.includes('"awards":['))app=app.replace('const titles={','const titles={"awards":["志愿荣誉","查询历年获奖人员、项目与团队。"],');
 if(!app.includes('/* AWARDS_HEIGHT */'))app+='\n/* AWARDS_HEIGHT */\nwindow.addEventListener("message",e=>{const f=document.querySelector(".awards-frame");if(f&&e.source===f.contentWindow&&e.origin===location.origin&&e.data?.type==="awards-height"&&Number.isFinite(e.data.height))f.style.height=Math.min(30000,Math.max(850,e.data.height))+"px"});';
 const dest=path.join(root,'public/awards');await fs.mkdir(dest,{recursive:true});for(const file of ['index.html','awards.css','awards.js','model.mjs','data.json'])await fs.copyFile(path.join(root,'features/awards',file),path.join(dest,file));
 return {template,app};
}
