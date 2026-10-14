import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://buaa-team-schedule-2026.liuhaoyuray.chatgpt.site';
const files=['index.template.html','app.js','engine.js','data.json'];
const localIndex=process.argv.indexOf('--from-local');
const local=localIndex>=0?path.resolve(process.argv[localIndex+1]):null;
const nonce=Date.now();
async function readAsset(name){
  if(local)return fs.readFile(path.join(local,name),'utf8');
  const url=new URL(name,origin+'/');url.searchParams.set('sync',String(nonce));
  const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'buaa-team-schedule-sync','Cache-Control':'no-cache'}});
  if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
  if(Number(response.headers.get('content-length'))>5_000_000)throw Error('Asset exceeds size limit');
  const text=await response.text();if(Buffer.byteLength(text)>5_000_000)throw Error('Asset exceeds size limit');return text;
}
const entries=await Promise.all(files.map(async name=>[name,await readAsset(name)]));
const assets=Object.fromEntries(entries);
const sourceHash=crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const statePath=path.join(root,'.sync/source.json');
let previous;try{previous=JSON.parse(await fs.readFile(statePath,'utf8'));}catch{}
if(previous?.sourceHash===sourceHash&&await fs.stat(path.join(root,'public/index.html')).catch(()=>null)){
  console.log('平台没有更新。');process.exit(0);
}
const data=JSON.parse(assets['data.json']);
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
await fs.writeFile(statePath,JSON.stringify({origin,sourceHash,uiVersion:data.meta.uiVersion,sourceUpdated:data.meta.updated,syncedAt:new Date().toISOString()},null,2)+'\n');
console.log(`已同步：${data.meta.activePeopleCount} 位现任人员，界面 ${data.meta.uiVersion}。`);
