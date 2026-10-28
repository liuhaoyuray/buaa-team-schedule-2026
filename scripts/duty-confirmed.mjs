import fs from 'node:fs/promises';import path from 'node:path';
export async function applyDutyConfirmed(root,template,app){
 const dir=path.join(root,'features/workspace');const [ui,css,js,data]=await Promise.all(['duty-confirmed.html','duty-confirmed.css','duty-confirmed.js','duty-confirmed.json'].map(n=>fs.readFile(path.join(dir,n),'utf8')));
 if(!template.includes('id="confirmedDuty"')){
  const anchor='<section id="dutyView" class="view">';if(!template.includes(anchor))throw Error('Duty view changed');
  template=template.replace(anchor,anchor+'<!--CONFIRMED-DUTY-->'+ui+'<!--/CONFIRMED-DUTY--><details class="duty-draft-fold"><summary>需要重新排班？打开排班工具</summary>');
  const end='</div></section>\n<section id="plannerView"';if(!template.includes(end))throw Error('Duty section end changed');template=template.replace(end,'</div></details></section>\n<section id="plannerView"');
 }
 template=template.replace(/<style id="confirmed-duty-css">[\s\S]*?<\/style>/g,'').replace('</head>','<style id="confirmed-duty-css">'+css+'</style></head>');
 app=app.replace(/\$\('pageFooter'\)\.textContent=[^\n]*;/, "$('pageFooter').hidden=true;");
 app=app.replace('renderDutyRoster();if(!dutyPlan)computeDuty(false);','renderDutyRoster();');
 app=app.replace('逐次核验有效期内的安排，再分别安排两部门值班。','查看已确定的每周值班安排。');
 app=app.replace(/\n\/\* CONFIRMED_DUTY_START \*\/[\s\S]*?\/\* CONFIRMED_DUTY_END \*\//g,'');
 app+='\n/* CONFIRMED_DUTY_START */\n'+js.replace('/*__CONFIRMED_DUTY__*/',()=>data)+'\n/* CONFIRMED_DUTY_END */';
 return {template,app};
}
