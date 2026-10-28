import {categories,requirements,attachmentLabels,parseMoney,money,mealPeople,validate,dateText} from './domain.mjs';
import {readInvoice,closeOcr} from './invoices.mjs';
import {materialPackage} from './materials.mjs';
const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let invoices=[],attachments={},busy=false,revision=0;
const profileKeys=['payee','payeeId','department','fund','contact','principal','principalId','acceptor'];
try{const saved=JSON.parse(localStorage.getItem('buaa-reimbursement-profile-v2')||'{}');for(const k of profileKeys)if(typeof saved[k]==='string')$(k).value=saved[k];if(!saved.department&&!saved.fund){const old=JSON.parse(localStorage.getItem('buaa-reimbursement-profile-v1')||'{}');for(const k of ['department','fund'])if(typeof old[k]==='string')$(k).value=old[k];}}catch{}
$('documentDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const data=()=>Object.fromEntries(['category','eventDate','documentDate','purpose','payee','payeeId','fund','department','contact','from','to','location','principal','principalId','acceptor'].map(k=>[k,$(k).value.trim()]));
function activeFiles(){const allowed=new Set(['invoice','extra',...requirements($('category').value)]);return [...invoices,...Object.values(attachments).flat()].filter(f=>allowed.has(f.kind));}
function claim(){const d=data();try{d.amountCents=parseMoney($('amount').value);}catch{d.amountCents=0;}d.confirmed=$('confirmed').checked;d.otherConfirmed=$('otherConfirmed').checked;return d;}
function refresh(){
 const d=claim(),files=activeFiles(),missing=validate(d,files);$('generate').disabled=busy||missing.length>0;
 $('missing').textContent=missing.length?'还需：'+missing.join('、'):'材料与必要信息已齐全，可直接生成。';
 $('mealCount').textContent=d.amountCents>0?`加班餐填表人数：${mealPeople(d.amountCents)}人（金额÷40，向上取整）。将自动填写审批表。`:'按实际金额自动计算加班餐填表人数。';
}
function invalidate(){revision++;$('confirmed').checked=false;status('');refresh();}
function syncTotal(){
 if(!invoices.length){$('amount').readOnly=false;return;}
 try{const total=invoices.reduce((n,r)=>n+parseMoney(r.amount),0);$('amount').value=money(total);$('amount').readOnly=true;}catch{$('amount').value='';$('amount').readOnly=true;}
}
function categoryChanged(){
 const category=$('category').value,route=['transport','courier'].includes(category);
 $('eventDateLabel').textContent=category==='meal'?'用餐日期':'费用发生日期';$('eventDateHelp').textContent=category==='meal'?'填写实际用餐日期，用于情况说明和审批表':'填写实际发生费用的日期，用于情况说明';
 $('routeFields').hidden=!route;$('locationField').hidden=!['meal','supplies','labor','other'].includes(category);$('mealCount').hidden=category!=='meal';$('otherCheck').hidden=category!=='other';
 $('fromLabel').textContent=category==='courier'?'寄出地（必填）':'出发地（必填）';$('toLabel').textContent=category==='courier'?'收件单位 / 目的地（必填）':'目的地（必填）';$('attachments').hidden=!category;
 $('materialList').textContent='将自动生成：报销明细单、'+(categories[category]||'')+'情况说明'+(category==='meal'?'、已填好的加班餐审批表':'')+'。'+(route?'行程单另需手写说明，包内会提供待抄写文字。':'');
 const types=requirements(category).filter(k=>k!=='invoice');
 $('attachmentInputs').innerHTML=types.map(kind=>`<label class="attachment">${attachmentLabels[kind]} <b>必传</b><input type="file" data-kind="${kind}" multiple accept="${['order','receipt'].includes(kind)?'.png,.jpg,.jpeg':'.pdf,.png,.jpg,.jpeg,.ofd'}"><small id="files-${kind}">${escape((attachments[kind]||[]).map(f=>f.name).join('；')||'尚未上传')}</small></label>`).join('');invalidate();
}
function renderInvoices(){
 $('invoiceRows').innerHTML=invoices.map((r,i)=>`<div class="invoice-row"><div><strong>${escape(r.name)}</strong><small>${escape(r.mode)}${r.invoiceNumber?' · 票号 '+escape(r.invoiceNumber):''}${r.date?' · 开票日期 '+escape(dateText(r.date)):''}</small><small>${escape(r.warning||'请核对识别内容')}</small></div><label>这张发票金额（元）<input data-invoice-amount="${i}" aria-label="第${i+1}张发票金额" inputmode="decimal" value="${escape(r.amount)}"></label><button data-remove="${i}" aria-label="移除第${i+1}张发票">×</button>${r.raw?`<details><summary>查看识别文字</summary><div class="invoice-text">${escape(r.raw)}</div></details>`:''}</div>`).join('');
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);try{await fn();}catch(e){status(e.message||String(e),true);}finally{busy=false;document.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);renderInvoices();syncTotal();refresh();}}
async function fileData(file,kind){if(!file.size||file.size>20*1024*1024)throw Error('每份附件须在20MB以内：'+file.name);const bytes=new Uint8Array(await file.arrayBuffer()),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return {name:file.name,bytes,kind,hash};}
$('invoices').onchange=()=>action(async()=>{
 const selected=[...$('invoices').files];if(selected.length+invoices.length>30)throw Error('一次最多30张发票，请按事项分开处理。');invalidate();const messages=[];
 for(const file of selected){
  const f=await fileData(file,'invoice');if(invoices.some(r=>r.hash===f.hash)){messages.push(file.name+'为重复文件，未重复计入');continue;}
  status('正在读取 '+file.name);let parsed;
  try{parsed=await readInvoice(file,message=>status(file.name+'：'+message));}catch(e){console.warn('Invoice recognition failed:',e.message);parsed={mode:'手动核对',amount:'',warnings:['识别未完成，请手动填写金额和日期'],raw:''};}
  if(parsed.invoiceNumber&&invoices.some(r=>r.invoiceNumber===parsed.invoiceNumber)){messages.push(file.name+'票号与已上传发票重复，未重复计入');continue;}
  invoices.push({...f,...parsed,warning:(parsed.warnings||[]).join('；')});
 }
 const suggested=[...new Set(invoices.map(r=>r.category).filter(Boolean))];if(!$('category').value&&suggested.length===1){$('category').value=suggested[0];categoryChanged();}
 renderInvoices();syncTotal();$('invoices').value='';$('recognition').textContent=`已放入${invoices.length}张发票，请逐张核对金额。${messages.join('；')}${suggested.length>1?'发票可能属于不同类别，请按类别分开处理。':''}`;status('发票读取完成，请补齐本次事项信息。');
});
$('invoiceRows').addEventListener('input',e=>{if(e.target.dataset.invoiceAmount!==undefined){invoices[Number(e.target.dataset.invoiceAmount)].amount=e.target.value;syncTotal();invalidate();}});
$('invoiceRows').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){invoices.splice(Number(b.dataset.remove),1);renderInvoices();syncTotal();invalidate();}});
async function saveAttachments(kind,files){const rows=[];for(const f of files)rows.push(await fileData(f,kind));attachments[kind]=rows;if($('files-'+kind))$('files-'+kind).textContent=rows.map(r=>r.name).join('；')||'尚未上传';invalidate();status('附件已读取。');}
$('attachmentInputs').addEventListener('change',e=>{if(e.target.dataset.kind)action(()=>saveAttachments(e.target.dataset.kind,[...e.target.files]));});
$('extra').onchange=()=>action(()=>saveAttachments('extra',[...$('extra').files]));
$('category').onchange=categoryChanged;
for(const id of ['eventDate','documentDate','purpose','payee','payeeId','fund','department','contact','from','to','location','principal','principalId','acceptor','amount','otherConfirmed'])$(id).addEventListener('input',invalidate);
$('confirmed').onchange=refresh;
async function pngPicture(f){
 const bitmap=await createImageBitmap(new Blob([f.bytes]));try{if(bitmap.width*bitmap.height>40000000)throw Error('附图尺寸过大，请缩小后上传：'+f.name);const ratio=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('附图处理失败');return {bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height,label:attachmentLabels[f.kind]};}finally{bitmap.close();}
}
$('generate').onclick=()=>action(async()=>{
 const d=claim(),files=activeFiles();if(files.reduce((n,f)=>n+f.bytes.length,0)>100*1024*1024)throw Error('附件合计超过100MB，请分批处理。');status('正在填写材料并打包…');
 const buffers=await Promise.all(['voucher.docx','statement.docx',...(d.category==='meal'?['meal.xlsx']:[])].map(async name=>{const response=await fetch(new URL('./templates/'+name,import.meta.url));if(!response.ok)throw Error('材料模板读取失败，请刷新重试');return response.arrayBuffer();}));
 const pictures=[];for(const f of files.filter(f=>['order','receipt'].includes(f.kind)))pictures.push(await pngPicture(f));
 const bytes=await materialPackage(d,files,{JSZip:window.JSZip,ExcelJS:window.ExcelJS,templates:{voucher:buffers[0],statement:buffers[1],meal:buffers[2]},pictures});
 if($('remember').checked)try{localStorage.setItem('buaa-reimbursement-profile-v2',JSON.stringify(Object.fromEntries(profileKeys.map(k=>[k,d[k]]))));}catch{}else try{localStorage.removeItem('buaa-reimbursement-profile-v2');}catch{}
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=d.documentDate+'_'+categories[d.category]+'_报销材料.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status('材料已生成并下载。请在文件内完成实际签字、盖章或手写步骤。');
});
$('claimForm').onsubmit=e=>e.preventDefault();
if(window.ExcelJS&&window.JSZip){$('invoices').disabled=false;$('recognition').textContent='PDF优先读取文字，扫描件与照片在本机识别。识别结果请核对。';}else status('工具加载失败，请刷新重试。',true);
categoryChanged();window.addEventListener('beforeunload',e=>{if(invoices.length||activeFiles().length){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',()=>closeOcr());
if(window.parent!==window){document.documentElement.dataset.embedded='true';const send=()=>window.parent.postMessage({type:'office-ledger-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)+25},location.origin);new ResizeObserver(send).observe(document.querySelector('main'));send();}
