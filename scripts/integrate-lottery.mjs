import { applyDutyConfirmed } from './duty-confirmed.mjs';
import { applyOfficeUpgrade } from './office-upgrade.mjs';
import { applyHoursUpgrade } from './hours-upgrade.mjs';
import { applyReimbursementUpgrade } from './reimbursement-upgrade.mjs';
import { applyWorkspaceUpgrade } from './workspace-upgrade.mjs';
import { applyPlatformUI } from './platform-ui.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const marker='/* BUAA_LOTTERY_PLATFORM_INTEGRATION */';
export async function integrateLottery(root){
 const output=path.join(root,'public'),feature=path.join(root,'features','lottery');
 let template=await fs.readFile(path.join(output,'index.template.html'),'utf8');
 let app=await fs.readFile(path.join(output,'app.js'),'utf8');
 const [panel,css,ui]=await Promise.all(['panel.html','panel.css','lottery-ui.js'].map(name=>fs.readFile(path.join(feature,name),'utf8')));
 if(template.includes('id="lotteryView"'))template=template.replace(/<section id="lotteryView"[\s\S]*?<\/section>/,()=>panel);
 if(!template.includes('id="lotteryView"')){
  const anchor='<button data-view="settings">';
  if(!template.includes(anchor)||!template.includes('<section id="settingsView"')||!template.includes('</style>'))throw Error('Platform navigation changed; cannot integrate lottery safely');
  const button='<button data-view="lottery"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15"/><path d="M12 6H8a2 2 0 1 1 2-2l2 2zm0 0h4a2 2 0 1 0-2-2l-2 2z"/></svg></span>幸运抽奖</button>';
  template=template.replace(anchor,button+anchor).replace('<section id="settingsView"',panel+'\n<section id="settingsView"').replace('</style>',css+'\n</style>');
 }
 if(!app.includes('window.LotteryPanel.setActive')){
  const anchor='const titles={"query":';
  if(!app.includes(anchor))throw Error('Platform view switcher changed; cannot integrate lottery safely');
  app=app.replace(anchor,'if(window.LotteryPanel)window.LotteryPanel.setActive(view===\'lottery\');const titles={"lottery":["幸运抽奖","志工部与实践部的幸运时刻，开始滚动，点击停止揭晓。"],"query":');
 }
 if(!app.includes(marker)&&!app.includes('window.LotteryPanel={'))app+='\n'+marker+'\n'+ui;
 ({template,app}=await applyPlatformUI(root,template,app));
 ({template,app}=await applyWorkspaceUpgrade(root,template,app));
 ({template,app}=await applyOfficeUpgrade(root,template,app));
 ({template,app}=await applyHoursUpgrade(root,template,app));
 ({template,app}=await applyReimbursementUpgrade(root,template,app));
 ({template,app}=await applyDutyConfirmed(root,template,app));
 new vm.Script(app);
 const [data,rawEngine]=await Promise.all(['data.js','engine.js'].map(name=>fs.readFile(path.join(output,name),'utf8')));
 // Uncertain timing with an explicit bounded interval is reserved; an unknown end remains uncertain.
 const oldClassify="const known=active.filter(e=>!e.uncertain),unknown=active.filter(e=>e.uncertain),reasons=[];";
 const newClassify="const known=active.filter(e=>!e.uncertain||(!e.endUnknown&&e.start&&e.end)),unknown=active.filter(e=>e.uncertain&&(e.endUnknown||!e.start||!e.end)),reasons=[];";
 let engine=rawEngine.replace(oldClassify,newClassify);
 if(!engine.includes(newClassify))throw Error('Schedule engine changed; review occupancy policy');
 engine=engine.replace("return {status,events:active,reasons:[...new Set(reasons)]};","return {status,events:active.map(e=>e.uncertain&&!e.endUnknown&&e.start&&e.end?{...e,uncertain:false}:e),reasons:[...new Set(reasons)]};");
 app=app.replace("unknown:'待确认'","unknown:'信息不完整'").replaceAll('周次／时间需确认','按已知时段占用').replaceAll('待确认：','信息不完整：').replace("r.status==='free'?'空闲':'需确认'","r.status==='free'?'空闲':'信息不完整'");

 let html=template;
 for(const [tag,code] of [['DATA',data],['ENGINE',engine],['APP',app]]){
  const placeholder='/*__'+tag+'__*/';
  if(!html.includes(placeholder))throw Error('Missing platform script placeholder: '+tag);
  html=html.replace(placeholder,()=>code.replaceAll('</script','<\\/script'));
 }
 await fs.copyFile(path.join(root,'features/workspace/buaa-emblem.png'),path.join(output,'buaa-emblem.png'));
 const generated={'index.template.html':template,'app.js':app,'index.html':html,'engine.js':engine};
 for(const name of ['signature.html','signature.js'])generated[name]=await fs.readFile(path.join(root,'features/office',name),'utf8');
 generated['signature-colleges.json']=await fs.readFile(path.join(root,'features/office/colleges.json'),'utf8');
 for(const name of ['lottery.html','lottery-embed.css','lottery-embed.js','lottery-session.js'])generated[name]=await fs.readFile(path.join(feature,name),'utf8');
 for(const [name,content] of Object.entries(generated)){
  const filename=path.join(output,name);
  if(await fs.readFile(filename,'utf8').catch(()=>null)!==content)await fs.writeFile(filename,content);
 }
 return {people:64,departments:{'志愿者工作部':35,'社会实践部':29}};
}
