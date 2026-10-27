import { applyOfficeUpgrade } from './office-upgrade.mjs';
import { applyHoursUpgrade } from './hours-upgrade.mjs';
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
 new vm.Script(app);
 const [data,engine]=await Promise.all(['data.js','engine.js'].map(name=>fs.readFile(path.join(output,name),'utf8')));
 let html=template;
 for(const [tag,code] of [['DATA',data],['ENGINE',engine],['APP',app]]){
  const placeholder='/*__'+tag+'__*/';
  if(!html.includes(placeholder))throw Error('Missing platform script placeholder: '+tag);
  html=html.replace(placeholder,()=>code.replaceAll('</script','<\\/script'));
 }
 const generated={'index.template.html':template,'app.js':app,'index.html':html};
 for(const name of ['lottery.html','lottery-embed.css','lottery-embed.js','lottery-session.js'])generated[name]=await fs.readFile(path.join(feature,name),'utf8');
 for(const [name,content] of Object.entries(generated)){
  const filename=path.join(output,name);
  if(await fs.readFile(filename,'utf8').catch(()=>null)!==content)await fs.writeFile(filename,content);
 }
 return {people:64,departments:{'志愿者工作部':35,'社会实践部':29}};
}



