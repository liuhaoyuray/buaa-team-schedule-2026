import { text, key, preparePeople, dateRange, customDates, plan } from './core.mjs';
import { loadWorkbook, guessHeader, columnsAt, readTemplate, readPeople, readHistory, exportTemplate, reportWorkbook, scalar } from './io.mjs';
if(window.parent===window&&!new URLSearchParams(location.search).has('standalone'))location.replace('./#hours');
if(window.parent!==window){document.documentElement.dataset.embedded='true';const send=()=>window.parent.postMessage({type:'hours-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)+25},location.origin);new ResizeObserver(send).observe(document.querySelector('main'));send();}
function syncAppearance(){try{document.body.classList.toggle('clear-mode',localStorage.getItem('buaa-schedule-2026-clear')==='true');}catch{}}
syncAppearance();window.addEventListener('storage',event=>{if(event.key==='buaa-schedule-2026-clear')syncAppearance();});

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields = {name:'姓名（必选）',hours:'总时长（必选）',student:'学号（选填）',card:'身份证号（选填）',phone:'联系方式（选填）',volunteerId:'志愿者编号（选填）'};
let templates=[],lists=[],historyFiles=[],used=new Set(),people=[],result=null,choices={},edits={},busy=false,dirty=false,historyError=false;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function clearResult(){result=null;$('results').hidden=true;}
function ready(){ $('analyze').disabled=busy || !templates.length || !lists.length || historyError; $('download').disabled=busy || !result || dirty; }
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);try{await fn();}catch(error){status(error.message||String(error),true);}finally{busy=false;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);if(templates.length)renderOrder();ready();}}
async function readFile(file){if(!/\.xlsx$/i.test(file.name))throw Error('仅支持.xlsx：'+file.name);if(file.size>25*1024*1024)throw Error(file.name+'超过25MB，请拆分文件。');const buffer=await file.arrayBuffer();return {buffer,workbook:await loadWorkbook(buffer,window.ExcelJS)};}
function invalidate(){clearResult();status('上传的文件或日期设置已更改，请重新匹配人员。');}
function renderOrder(){
 $('templateOrder').innerHTML=templates.map((t,i)=>`<div class="template-item" data-template="${t.uid}"><div><strong>第 ${i+1} 组：${esc(t.filename)}</strong><p class="hint">模板中的人员：${t.rows.length} 人</p><label class="group-label">下载文件中显示的组别名称 <input aria-label="下载文件中显示的组别名称" data-label="${t.uid}" value="${esc(t.label)}" maxlength="30"><small>只用于命名文件，不改变模板中的人员。</small></label></div><button data-move="${t.uid}" data-delta="-1" ${i===0?'disabled':''} aria-label="将此组向前移动">↑ 上移</button><button data-move="${t.uid}" data-delta="1" ${i===templates.length-1?'disabled':''} aria-label="将此组向后移动">↓ 下移</button><details class="date-override" ${t.override.trim()?'open':''}><summary>只为这一组另选日期（选填）</summary><p class="hint">填写后，这一组会使用这里的日期和先后顺序，代替上方的日期范围和选择。</p><label>从第一天要填的日期开始，每行填写一个日期<textarea data-dates="${t.uid}" placeholder="例如：2026-10-23&#10;2026-10-22&#10;2026-10-21">${esc(t.override)}</textarea></label></details></div>`).join('');
}
function mappingOptions(list,field){
 const sheet=list.workbook.getWorksheet(list.sheetName),row=sheet.getRow(list.headerRow),columns=Math.max(sheet.columnCount,1);
 return '<option value="">不使用这一项</option>'+Array.from({length:columns},(_,i)=>`<option value="${i+1}" ${Number(list.fields[field])===i+1?'selected':''}>第 ${i+1} 列 · ${esc(text(scalar(row.getCell(i+1).value)).slice(0,50)||'列名为空')}</option>`).join('');
}
function renderMappings(){
 $('mappings').innerHTML=lists.map((list,i)=>{
  const sheet=list.workbook.getWorksheet(list.sheetName), sample=[];
  for(let n=list.headerRow+1;n<=Math.min(list.headerRow+3,sheet.rowCount);n++)sample.push([list.fields.name?text(scalar(sheet.getCell(n,Number(list.fields.name)).value)):'未选择姓名',list.fields.hours?text(scalar(sheet.getCell(n,Number(list.fields.hours)).value)):'未选择时长'].join(' / '));
  return `<div class="mapping" data-list="${i}"><h3>检查名单：${esc(list.filename)}</h3><p class="hint">先选择名单所在的工作表，再确认“姓名”“总时长”等内容分别在哪一列。其他身份信息有助于区分重名，名单没有时可以不选。</p><div class="fields"><label>名单所在的工作表<select data-sheet="${i}">${list.workbook.worksheets.map(s=>`<option ${s.name===list.sheetName?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>列名所在的行<input type="number" data-header="${i}" min="1" max="${sheet.rowCount}" value="${list.headerRow}"><small>例如第一行写着“姓名、学号、时长”，这里填 1。</small></label></div><div class="fields">${Object.entries(fields).map(([field,label])=>`<label>${label}<select data-field="${field}" data-list-index="${i}">${mappingOptions(list,field)}</select></label>`).join('')}</div><p class="hint">按所选列读取的前 3 条姓名和时长：${esc(sample.join('；'))}。请确认时长单位是小时；如果原表使用其他单位，请先换算或在下一步手动填写小时数。</p></div>`;
 }).join('');
}
function buildPeople(){return preparePeople(lists.flatMap(l=>readPeople(l.workbook,l.sheetName,l.headerRow,l.fields,l.filename)));}
function setDates(){
 const defaultDates=dateRange($('start').value,$('end').value,$('direction').value);
 for(const t of templates)t.dates=t.override.trim()?customDates(t.override):defaultDates;
 if(new Set(templates.map(t=>t.label)).size!==templates.length)throw Error('下载文件中的组别名称重复，请为每一组填写不同的名称。');
}
function allocate(){
 if(historyError)throw Error('以前导入的文件读取失败，请重新选择正确的文件，或清空所选文件。');
 setDates();result=plan(people,templates,used,choices,edits);
 result.files.forEach((f,i)=>{const ti=templates.findIndex(t=>t.uid===f.template),di=templates[ti].dates.indexOf(f.date);f.name=`${String(ti+1).padStart(2,'0')}_模板${safe(f.label)}_${String(di+1).padStart(3,'0')}_${f.date}.xlsx`;});
 dirty=false;renderResult();status(`检查完成：名单中能识别的总时长为 ${result.total} 小时，其中 ${result.prepared} 小时已安排进待下载文件，${result.pending} 小时还未安排。${result.invalid?'另有 '+result.invalid+' 条时长无法识别，尚未计入总时长。':''}`);
}
function renderResult(){
 $('results').hidden=false;
 const pendingCount=result.entries.filter(e=>e.reason||e.pending>0).length;
 $('totals').innerHTML=[[result.entries.length+' 人','名单人数（相同记录只计一次）'],[result.prepared+' 小时','已安排到文件中 · '+result.files.length+' 份文件'],[result.pending+' 小时','尚未安排到文件 · '+pendingCount+' 人需处理'],[result.invalid?result.invalid+' 条':'核对通过',result.invalid?'时长无法识别，未计入总时长':'可识别总时长 = 已安排 + 尚未安排']].map(([n,label])=>`<div><strong>${esc(n)}</strong><small>${esc(label)}</small></div>`).join('');
 $('fileOrder').innerHTML=result.files.map(f=>`<li>${esc(f.name)} · 包含 ${f.records.length} 人，共 ${f.hours} 小时</li>`).join('')||'<li>暂时没有可以生成的导入文件；仍可下载人员明细，查看需要处理的原因。</li>';
 renderPeople();
}
function renderPeople(){
 const entries=result.entries.filter(e=>!$('onlyPending').checked||e.reason||e.pending>0);
 $('people').innerHTML='<table><thead><tr>'+['姓名 / 学号','应录入总时长','已安排 / 未安排','需要检查什么','此人的志愿者编号','名单来源'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(entries.length?entries.map(e=>`<tr><td>${esc(e.person.name||'姓名未提供')}<small>${esc(e.person.student||'学号未提供')}</small></td><td><input aria-label="${esc(e.person.name)}应录入总时长" data-hours="${e.person.uid}" value="${esc(edits[e.person.uid]??e.person.rawHours??e.person.hours??'')}" inputmode="decimal"><small>小时，可修改</small></td><td>${e.prepared} / ${e.pending} 小时<small>${e.person.hours===null?'原名单中的时长无法识别，请填写小时数':''}</small></td><td>${esc(e.reason||'已找到对应人员，时长已安排到文件中')}<small>${esc(e.person.notes)}</small></td><td>${e.candidates.length?`<select aria-label="${esc(e.person.name)}对应的志愿者编号" data-choice="${e.person.uid}"><option value="">${e.match?'自动匹配：'+esc(e.match.id):'请选择此人的编号'}</option><option value="skip" ${choices[e.person.uid]==='skip'?'selected':''}>本次先不处理此人</option>${e.candidates.map(c=>`<option value="${esc(c.id)}" ${choices[e.person.uid]===c.id?'selected':''}>第 ${esc(c.label)} 组 · 编号 ${esc(c.id)}${c.student?' · 学号 '+esc(c.student):''}${c.phone?' · 电话 '+esc(c.phone):''}</option>`).join('')}</select>`:'上传的模板中没有同名人员，请确认是否报名，或下载更新后的模板'}</td><td>${esc(e.person.sources.join('；'))}${e.person.duplicateCount?'<small>相同人员的重复记录只计一次</small>':''}</td></tr>`).join(''):`<tr><td colspan="6">${$('onlyPending').checked?'没有需要处理的人员。取消上方勾选可查看全部人员。':'名单中没有人员。'}</td></tr>`)+ '</tbody></table>';
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
 if(!result)throw Error('请先点击“匹配人员并查看结果”。');
 const zip=new window.JSZip(),folder=zip.folder(safe($('project').value)+'_时长导入材料');
 for(let i=0;i<result.files.length;i++){
  const f=result.files[i],template=templates.find(t=>t.uid===f.template);status(`正在生成并检查第 ${i+1} / ${result.files.length} 份文件：${f.name}`);
  folder.file(f.name,await exportTemplate(template,f,window.ExcelJS));await new Promise(r=>setTimeout(r,0));
 }
 folder.file('00_未匹配人员明细及全部核对.xlsx',await reportWorkbook(result,window.ExcelJS));
 folder.file('00_共用佐证材料.png',await proofPng());
 const instructions=[$('project').value,'请按下面的顺序上传文件：先完成第一组的各个日期，再处理第二组，依次类推。','每人每天最多填 8 小时；所有导入文件可共用同一张图片。',`名单中能识别的时长共 ${result.total} 小时 = 已安排到文件中的 ${result.prepared} 小时 + 尚未安排的 ${result.pending} 小时。`,result.invalid?`另有 ${result.invalid} 条时长无法识别，未计入总时长，请在人员明细中检查。`:'名单总时长与安排结果核对一致。',historyFiles.length?`已读取 ${historyFiles.length} 份以前的导入文件，发现 ${used.size} 条某人某日已有时长的记录；这些人的相应日期已跳过。`:'未上传以前的导入文件，请自行确认所选日期是否已经录入过时长。','找不到对应人员、重名或日期不足的情况，请查看人员明细。生成文件后，还需要上传到志愿系统。',...result.files.map((f,i)=>`${i+1}. ${f.name}：${f.records.length} 人，共 ${f.hours} 小时`),'没有填写时长的行不会计入本次时长；姓名和志愿者编号保留系统模板中的内容。'];
 folder.file('00_导入顺序与核对说明.txt','\uFEFF'+instructions.join('\r\n'));
 status('正在打包…');const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safe($('project').value)+'_时长导入材料.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`已下载压缩包，包含 ${result.files.length} 份导入文件、共用图片和人员明细。请按文件编号依次上传到志愿系统。`);
}
$('templates').onchange=()=>action(async()=>{
 templates=[];clearResult();renderOrder();
 const files=[...$('templates').files];if(files.length>30)throw Error('一次最多30份模板。');const next=[];
 for(const [i,file] of files.entries()){status('正在读取模板：'+file.name);const {buffer,workbook}=await readFile(file);next.push({...readTemplate(workbook,file.name,i),buffer});}
 templates=next;choices={};edits={};clearResult();renderOrder();ready();status('已读取系统模板，请上传人员及总时长名单。');
});
$('lists').onchange=()=>action(async()=>{
 lists=[];clearResult();renderMappings();
 const files=[...$('lists').files];if(files.length>20)throw Error('一次最多20份人员清单。');const next=[];
 for(const file of files){status('正在读取清单：'+file.name);const {workbook}=await readFile(file);let selected=workbook.worksheets[0],guess=guessHeader(selected);for(const sheet of workbook.worksheets){const g=guessHeader(sheet);if(g.score>guess.score){selected=sheet;guess=g;}}next.push({filename:file.name,workbook,sheetName:selected.name,headerRow:guess.row,fields:guess.fields});}
 lists=next;choices={};edits={};clearResult();renderMappings();ready();status('已读取名单，请检查下方选择的工作表和各列是否正确。');
});
$('history').onchange=()=>action(async()=>{historyError=true;clearResult();$('historyStatus').textContent='正在读取以前的导入文件，请稍候。';const files=[...$('history').files];if(files.length>150)throw Error('一次最多上传 150 份以前的导入文件。');const next=new Set();for(const file of files){status('正在读取以前的导入文件：'+file.name);const {workbook}=await readFile(file);for(const k of readHistory(workbook,file.name))next.add(k);}used=next;historyFiles=files;historyError=false;invalidate();$('historyStatus').textContent=`已读取 ${files.length} 份文件，发现 ${next.size} 条“某人某日已有时长”的记录；会跳过这些人的相应日期。`;});
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
$('people').addEventListener('input',e=>{if(e.target.dataset.choice!==undefined)choices[e.target.dataset.choice]=e.target.value;if(e.target.dataset.hours!==undefined)edits[e.target.dataset.hours]=e.target.value;dirty=true;$('download').disabled=true;status('已修改人员信息，请点击“应用修改并重新计算”后再下载。');});
$('download').onclick=()=>action(downloadAll);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('start').value=$('end').value=today;
if(!window.ExcelJS||!window.JSZip)status('工具加载失败，请刷新或检查网络后重试。',true);else{$('templates').disabled=$('lists').disabled=false;status('工具已准备好，请上传模板和人员清单。');}
window.addEventListener('beforeunload',e=>{if(templates.length||lists.length){e.preventDefault();e.returnValue='';}});
