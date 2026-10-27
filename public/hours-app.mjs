import { text, key, preparePeople, dateRange, customDates, plan } from './core.mjs';
import { loadWorkbook, guessHeader, columnsAt, readTemplate, readPeople, readHistory, exportTemplate, reportWorkbook, scalar } from './io.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields = {name:'姓名',hours:'拟录入时长',student:'学号',card:'身份证号',phone:'联系方式',volunteerId:'志愿者编号（可选）'};
let templates=[],lists=[],historyFiles=[],used=new Set(),people=[],result=null,choices={},edits={},busy=false,dirty=false,historyError=false;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function clearResult(){result=null;$('results').hidden=true;}
function ready(){ $('analyze').disabled=busy || !templates.length || !lists.length || historyError; $('download').disabled=busy || !result || dirty; }
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);try{await fn();}catch(error){status(error.message||String(error),true);}finally{busy=false;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);ready();}}
async function readFile(file){if(!/\.xlsx$/i.test(file.name))throw Error('仅支持.xlsx：'+file.name);if(file.size>25*1024*1024)throw Error(file.name+'超过25MB，请拆分文件。');const buffer=await file.arrayBuffer();return {buffer,workbook:await loadWorkbook(buffer,window.ExcelJS)};}
function invalidate(){clearResult();status('资料或规则已变化，请重新匹配。');}
function renderOrder(){
 $('templateOrder').innerHTML=templates.map((t,i)=>`<div class="template-item" data-template="${t.uid}"><div><strong>${i+1}. ${esc(t.filename)}</strong><p class="hint">${t.rows.length}人 · 模板编号 <input aria-label="模板编号" data-label="${t.uid}" value="${esc(t.label)}" maxlength="30"></p></div><button data-move="${t.uid}" data-delta="-1" ${i===0?'disabled':''} aria-label="上移模板">↑</button><button data-move="${t.uid}" data-delta="1" ${i===templates.length-1?'disabled':''} aria-label="下移模板">↓</button><label class="date-override">本模板单独指定日期（可留空，按输入顺序录入）<textarea data-dates="${t.uid}" placeholder="例如：2026-10-23, 2026-10-22, 2026-10-21">${esc(t.override)}</textarea></label></div>`).join('');
}
function mappingOptions(list,field){
 const sheet=list.workbook.getWorksheet(list.sheetName),row=sheet.getRow(list.headerRow),columns=Math.max(sheet.columnCount,1);
 return '<option value="">未提供</option>'+Array.from({length:columns},(_,i)=>`<option value="${i+1}" ${Number(list.fields[field])===i+1?'selected':''}>${i+1}列 · ${esc(text(scalar(row.getCell(i+1).value)).slice(0,50)||'无表头')}</option>`).join('');
}
function renderMappings(){
 $('mappings').innerHTML=lists.map((list,i)=>{
  const sheet=list.workbook.getWorksheet(list.sheetName), sample=[];
  for(let n=list.headerRow+1;n<=Math.min(list.headerRow+3,sheet.rowCount);n++)sample.push([list.fields.name?text(scalar(sheet.getCell(n,Number(list.fields.name)).value)):'未选择姓名',list.fields.hours?text(scalar(sheet.getCell(n,Number(list.fields.hours)).value)):'未选择时长'].join(' / '));
  return `<div class="mapping" data-list="${i}"><h3>${esc(list.filename)}</h3><div class="fields"><label>工作表<select data-sheet="${i}">${list.workbook.worksheets.map(s=>`<option ${s.name===list.sheetName?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>表头在第几行<input type="number" data-header="${i}" min="1" max="${sheet.rowCount}" value="${list.headerRow}"></label></div><div class="fields">${Object.entries(fields).map(([field,label])=>`<label>${label}<select data-field="${field}" data-list-index="${i}">${mappingOptions(list,field)}</select></label>`).join('')}</div><p class="hint">前3条姓名 / 时长预览：${esc(sample.join('；'))}。若“献血量”列存的是cc，须先换成正确时长，或在匹配后逐人补正。</p></div>`;
 }).join('');
}
function buildPeople(){return preparePeople(lists.flatMap(l=>readPeople(l.workbook,l.sheetName,l.headerRow,l.fields,l.filename)));}
function setDates(){
 const defaultDates=dateRange($('start').value,$('end').value,$('direction').value);
 for(const t of templates)t.dates=t.override.trim()?customDates(t.override):defaultDates;
 if(new Set(templates.map(t=>t.label)).size!==templates.length)throw Error('模板编号不能重复，请修改模板编号。');
}
function allocate(){
 if(historyError)throw Error('历史文件读取失败，请重新选择有效历史文件，或清空历史文件选择。');
 setDates();result=plan(people,templates,used,choices,edits);
 result.files.forEach((f,i)=>{const ti=templates.findIndex(t=>t.uid===f.template),di=templates[ti].dates.indexOf(f.date);f.name=`${String(ti+1).padStart(2,'0')}_模板${safe(f.label)}_${String(di+1).padStart(3,'0')}_${f.date}.xlsx`;});
 dirty=false;renderResult();status(`核对完成：总计${result.total}小时 = 本次生成${result.prepared}小时 + 待处理${result.pending}小时。${result.invalid?'另有'+result.invalid+'条时长无法识别，需补正。':''}`);
}
function renderResult(){
 $('results').hidden=false;
 const pendingCount=result.entries.filter(e=>e.reason||e.pending>0).length;
 $('totals').innerHTML=[[result.entries.length,'去重后人数'],[result.prepared+'h','本次可导入 · '+result.files.length+'份文件'],[result.pending+'h','剩余时长 · '+pendingCount+'人待处理'],[result.invalid||'通过',result.invalid?'时长待补正（未计入合计）':'原名单 = 本次生成 + 待处理']].map(([n,label])=>`<div><strong>${esc(n)}</strong><small>${esc(label)}</small></div>`).join('');
 $('fileOrder').innerHTML=result.files.map(f=>`<li>${esc(f.name)} · ${f.records.length}人 / ${f.hours}小时</li>`).join('')||'<li>尚无可导入记录，可先下载待处理明细。</li>';
 renderPeople();
}
function renderPeople(){
 const entries=result.entries.filter(e=>!$('onlyPending').checked||e.reason||e.pending>0);
 $('people').innerHTML='<table><thead><tr>'+['姓名 / 学号','拟录入时长','已分配 / 剩余','匹配情况','确认模板编号','资料来源'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+entries.map(e=>`<tr><td>${esc(e.person.name||'缺姓名')}<small>${esc(e.person.student||'学号未提供')}</small></td><td><input aria-label="${esc(e.person.name)}拟录入时长" data-hours="${e.person.uid}" value="${esc(edits[e.person.uid]??e.person.rawHours??e.person.hours??'')}" inputmode="decimal"><small>小时</small></td><td>${e.prepared} / ${e.pending}<small>${e.person.hours===null?'原始时长无法识别':''}</small></td><td>${esc(e.reason||'已匹配，待导入')}<small>${esc(e.person.notes)}</small></td><td>${e.candidates.length?`<select aria-label="${esc(e.person.name)}确认编号" data-choice="${e.person.uid}"><option value="">自动匹配${e.match?'：'+esc(e.match.id):' / 待核对'}</option><option value="skip" ${choices[e.person.uid]==='skip'?'selected':''}>暂不录入</option>${e.candidates.map(c=>`<option value="${esc(c.id)}" ${choices[e.person.uid]===c.id?'selected':''}>模板${esc(c.label)} · ${esc(c.id)}${c.student?' · '+esc(c.student):''}${c.phone?' · '+esc(c.phone):''}</option>`).join('')}</select>`:'无同名候选，请补报名并下载新模板'}</td><td>${esc(e.person.sources.join('；'))}${e.person.duplicateCount?'<small>重复记录已去重</small>':''}</td></tr>`).join('')+'</tbody></table>';
}
const safe=value=>text(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,70)||'项目';
async function proofPng(){
 const selected=$('proof').files[0];
 if(selected){if(selected.size>20*1024*1024)throw Error('佐证图片超过20MB，请压缩后上传。');const bitmap=await createImageBitmap(selected);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('佐证图片尺寸过大，请缩小后上传。');}const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片转换失败')),'image/png'));}
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1040;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f5f7fb';ctx.fillRect(0,0,1600,1040);ctx.fillStyle='#142640';ctx.fillRect(0,0,1600,230);ctx.fillStyle='#fff';ctx.font='bold 46px "Microsoft YaHei",sans-serif';ctx.fillText('志愿服务时长汇总材料',80,105);ctx.font='28px "Microsoft YaHei",sans-serif';
 const name=$('project').value||'志愿服务项目';let title=name;while(ctx.measureText(title).width>1440)title=title.slice(0,-2)+'…';ctx.fillText(title,80,170);
 ctx.fillStyle='#142640';ctx.font='bold 35px "Microsoft YaHei",sans-serif';
 const ready=result.entries.filter(e=>e.prepared>0).length,pending=result.entries.filter(e=>e.reason||e.pending>0).length,dates=[...new Set(result.files.map(f=>f.date))].sort();
 const lines=[`名单人数：${result.entries.length}人    可识别时长：${result.total}小时`,`本次生成：${ready}人 / ${result.prepared}小时 / ${result.files.length}份导入文件`,`待处理：${pending}人 / ${result.pending}小时${result.invalid?'（另有'+result.invalid+'条时长待补正）':''}`,`日期：${dates.length?dates[0]+' 至 '+dates.at(-1):'尚无可用日期'}`];
 lines.forEach((line,i)=>ctx.fillText(line,80,330+i*95));ctx.font='25px "Microsoft YaHei",sans-serif';ctx.fillStyle='#52617a';
 ['依据：本次上传的人员时长清单及系统模板。','规则：以模板编号为准，每人每日不超过8小时；重名待核对。','本图为资料整理汇总，实际服务记录以原始材料及系统审核为准。','全部导入模板可共用本图；生成文件不代表已完成系统录入。'].forEach((line,i)=>ctx.fillText(line,80,760+i*53));
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('汇总图片生成失败')),'image/png'));
}
async function downloadAll(){
 if(!result)throw Error('请先匹配并核对。');
 const zip=new window.JSZip(),folder=zip.folder(safe($('project').value)+'_时长导入材料');
 for(let i=0;i<result.files.length;i++){
  const f=result.files[i],template=templates.find(t=>t.uid===f.template);status(`正在生成并校验 ${i+1}/${result.files.length}：${f.name}`);
  folder.file(f.name,await exportTemplate(template,f,window.ExcelJS));await new Promise(r=>setTimeout(r,0));
 }
 folder.file('00_未匹配人员明细及全部核对.xlsx',await reportWorkbook(result,window.ExcelJS));
 folder.file('00_共用佐证材料.png',await proofPng());
 const instructions=[$('project').value,'先模板、再日期，按下面顺序导入。','每人每天最多8小时；所有导入文件共用同一张佐证图片。',`去重名单可识别时长${result.total}h = 本次生成${result.prepared}h + 待处理${result.pending}h。`,result.invalid?`另有${result.invalid}条时长无法识别，未计入上述合计，须补正。`:'时长核对通过。',historyFiles.length?`本次已读取${historyFiles.length}份历史文件，避开${used.size}个人员日期组合。`:'未上传历史文件，请确认选择的日期未在系统中使用。','未匹配及待处理人员见明细文件；生成或下载不代表实际录入成功。',...result.files.map((f,i)=>`${i+1}. ${f.name}：${f.records.length}人，${f.hours}h`),'空白时长行无需录入；编号和名单顺序保留原模板。'];
 folder.file('00_导入顺序与核对说明.txt','\uFEFF'+instructions.join('\r\n'));
 status('正在打包…');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safe($('project').value)+'_时长导入材料.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`已下载${result.files.length}份导入模板、共用图片及核对明细；时长校验通过。`);
}
$('templates').onchange=()=>action(async()=>{
 templates=[];clearResult();renderOrder();
 const files=[...$('templates').files];if(files.length>30)throw Error('一次最多30份模板。');const next=[];
 for(const [i,file] of files.entries()){status('正在读取模板：'+file.name);const {buffer,workbook}=await readFile(file);next.push({...readTemplate(workbook,file.name,i),buffer});}
 templates=next;choices={};edits={};clearResult();renderOrder();ready();status('模板读取完成，请上传并核对人员清单。');
});
$('lists').onchange=()=>action(async()=>{
 lists=[];clearResult();renderMappings();
 const files=[...$('lists').files];if(files.length>20)throw Error('一次最多20份人员清单。');const next=[];
 for(const file of files){status('正在读取清单：'+file.name);const {workbook}=await readFile(file);let selected=workbook.worksheets[0],guess=guessHeader(selected);for(const sheet of workbook.worksheets){const g=guessHeader(sheet);if(g.score>guess.score){selected=sheet;guess=g;}}next.push({filename:file.name,workbook,sheetName:selected.name,headerRow:guess.row,fields:guess.fields});}
 lists=next;choices={};edits={};clearResult();renderMappings();ready();status('请核对工作表、表头及列的对应关系，再匹配。');
});
$('history').onchange=()=>action(async()=>{historyError=true;clearResult();$('historyStatus').textContent='正在读取历史文件，读取成功前暂不生成。';const files=[...$('history').files];if(files.length>150)throw Error('一次最多150份历史文件。');const next=new Set();for(const file of files){status('正在读取历史记录：'+file.name);const {workbook}=await readFile(file);for(const k of readHistory(workbook,file.name))next.add(k);}used=next;historyFiles=files;historyError=false;invalidate();$('historyStatus').textContent=`已读取${files.length}份文件，避开${next.size}个人员日期组合。`;});
$('templateOrder').addEventListener('click',e=>{const b=e.target.closest('[data-move]');if(!b)return;const i=templates.findIndex(t=>String(t.uid)===b.dataset.move),j=i+Number(b.dataset.delta);if(j>=0&&j<templates.length){[templates[i],templates[j]]=[templates[j],templates[i]];invalidate();renderOrder();}});
$('templateOrder').addEventListener('input',e=>{const t=templates.find(t=>String(t.uid)===(e.target.dataset.label??e.target.dataset.dates));if(!t)return;if(e.target.dataset.label!==undefined)t.label=e.target.value;else t.override=e.target.value;invalidate();});
$('mappings').addEventListener('change',e=>{
 const el=e.target;if(el.dataset.sheet!==undefined){const l=lists[Number(el.dataset.sheet)];l.sheetName=el.value;const g=guessHeader(l.workbook.getWorksheet(l.sheetName));l.headerRow=g.row;l.fields=g.fields;}
 else if(el.dataset.header!==undefined){const l=lists[Number(el.dataset.header)],row=Number(el.value),sheet=l.workbook.getWorksheet(l.sheetName);if(!Number.isInteger(row)||row<1||row>sheet.rowCount){status('表头行超出工作表范围。',true);return;}l.headerRow=row;l.fields=columnsAt(sheet,row);}
 else if(el.dataset.field){lists[Number(el.dataset.listIndex)].fields[el.dataset.field]=Number(el.value)||null;}
 choices={};edits={};invalidate();renderMappings();
});
for(const id of ['start','end','direction'])$(id).onchange=invalidate;
$('analyze').onclick=()=>action(async()=>{people=buildPeople();if(people.length>20000)throw Error('单次人员清单最多2万人，请分批处理。');choices={};edits={};allocate();});
$('recheck').onclick=()=>action(async()=>allocate());
$('onlyPending').onchange=()=>{if(result)renderPeople();};
$('people').addEventListener('input',e=>{if(e.target.dataset.choice!==undefined)choices[e.target.dataset.choice]=e.target.value;if(e.target.dataset.hours!==undefined)edits[e.target.dataset.hours]=e.target.value;dirty=true;$('download').disabled=true;status('已修改选择，请点击“应用选择并重新核对”。');});
$('download').onclick=()=>action(downloadAll);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('start').value=$('end').value=today;
if(!window.ExcelJS||!window.JSZip)status('工具加载失败，请刷新或检查网络后重试。',true);else{$('templates').disabled=$('lists').disabled=false;status('工具已准备好，请上传模板和人员清单。');}
window.addEventListener('beforeunload',e=>{if(templates.length||lists.length){e.preventDefault();e.returnValue='';}});
