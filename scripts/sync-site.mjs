import { integrateLottery } from './integrate-lottery.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://buaa-team-schedule-2026.liuhaoyuray.chatgpt.site';
const localIndex=process.argv.indexOf('--from-local');
const local=localIndex>=0?path.resolve(process.argv[localIndex+1]):null;
async function readAsset(name){
  if(local)return fs.readFile(path.join(local,name),'utf8');
  const url=new URL(name,origin+'/');url.searchParams.set('sync',String(Date.now()));
  const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'buaa-team-schedule-sync','Cache-Control':'no-cache'}});
  if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
  if(Number(response.headers.get('content-length'))>5_000_000)throw Error('Asset exceeds size limit');
  const text=await response.text();if(Buffer.byteLength(text)>5_000_000)throw Error('Asset exceeds size limit');return text;
}
// One self-contained document keeps the template, code and data on one release.
// Separate asset requests can reach different CDN snapshots during a publish.
let source,assets,data;
for(let attempt=0;attempt<5;attempt++){
 try{
  source=await readAsset('index.html');
  const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const select=prefix=>{const found=scripts.filter(s=>s[1].trim().startsWith(prefix));if(found.length!==1)throw Error('Missing or duplicate application script');return found[0]};
  const appScripts=[select('window.SCHEDULE_DATA='),select('(function(root){'),select('const DATA=window.SCHEDULE_DATA')];
  const dataScript=appScripts[0][1].trim(),prefix='window.SCHEDULE_DATA=';
  if(!dataScript.startsWith(prefix)||!dataScript.endsWith(';'))throw Error('Unexpected data assignment');
  data=JSON.parse(dataScript.slice(prefix.length,-1));
  if(!Number.isFinite(data.meta?.buildNumber)||data.meta.buildNumber<4)throw Error('Source release is still updating');
  const tags=['DATA','ENGINE','APP'];
  // Hosting may inject its own scripts; only mirror our three app scripts.
  const template=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,whole=>{const i=appScripts.findIndex(s=>s[0]===whole);return i<0?'':'<script>/*__'+tags[i]+'__*/</script>'});
  assets={'index.template.html':template,'app.js':appScripts[2][1],'engine.js':appScripts[1][1],'data.json':JSON.stringify(data)};
  new vm.Script(assets['app.js']);new vm.Script(assets['engine.js']);break;
 }catch(error){
  if(local)throw error;
  if(attempt===4){
   const cached=await fs.stat(path.join(root,'public/data.js')).catch(()=>null);
   if(!cached||!await fs.stat(path.join(root,'public/index.template.html')).catch(()=>null))throw error;
   console.warn('源平台暂不可读取，使用仓库中上次成功同步的课表发布；稍后会自动重试。原因：'+error.message);
   await integrateLottery(root);process.exit(0);
  }
  console.log('源平台正在更新，稍后重试。');await new Promise(r=>setTimeout(r,10000));
 }
}
const sourceHash=crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex');
const statePath=path.join(root,'.sync/source.json');
let previous;try{previous=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{}
if(previous?.sourceHash===sourceHash&&await fs.stat(path.join(root,'public/index.html')).catch(()=>null)){
  await integrateLottery(root);console.log('课表没有更新，已保留幸运抽奖。');process.exit(0);
}
if(previous?.buildNumber>data.meta.buildNumber)throw Error('Refusing an older source release');
if(data.meta?.week1!=='2026-09-07'||!Array.isArray(data.people)||!data.people.length||!Array.isArray(data.events))throw Error('Unexpected schedule data');
if(!assets['index.template.html'].includes('/*__DATA__*/')||!assets['index.template.html'].includes('/*__APP__*/'))throw Error('Unexpected HTML template');
new vm.Script(assets['app.js']);new vm.Script(assets['engine.js']);
// Keep download links on the original site; do not copy raw personnel forms.
function rewrite(value){
  if(typeof value==='string'&&value.startsWith('sources/'))return new URL(value,origin+'/').href;
  if(Array.isArray(value))return value.map(rewrite);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='sourceRoot').map(([key,item])=>[key,rewrite(item)]));
  return value;
}
const published=rewrite(data),dataJs='window.SCHEDULE_DATA='+JSON.stringify(published)+';';
const template=assets['index.template.html'].replaceAll('href="sources/','href="'+origin+'/sources/');
let html=template;
for(const [tag,content] of [['DATA',dataJs],['ENGINE',assets['engine.js']],['APP',assets['app.js']]])html=html.replace('/*__'+tag+'__*/',()=>content.replaceAll('</script','<\\/script'));
const output={'index.html':html,'index.template.html':template,'app.js':assets['app.js'],'engine.js':assets['engine.js'],'data.json':JSON.stringify(published,null,2),'data.js':dataJs,'.nojekyll':''};
await fs.mkdir(path.join(root,'public'),{recursive:true});
for(const [name,content] of Object.entries(output))await fs.writeFile(path.join(root,'public',name),content);
await fs.mkdir(path.dirname(statePath),{recursive:true});
await fs.writeFile(statePath,JSON.stringify({origin,sourceHash,buildNumber:data.meta.buildNumber,uiVersion:data.meta.uiVersion,sourceUpdated:data.meta.updated,syncedAt:new Date().toISOString()},null,2)+'\n');
await integrateLottery(root);
console.log(`已同步：${data.meta.activePeopleCount} 位现任人员，界面 ${data.meta.uiVersion}。`);

