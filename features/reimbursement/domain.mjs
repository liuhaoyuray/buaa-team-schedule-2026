export const categories={transport:'交通',courier:'快递',meal:'加班餐',supplies:'物资购买',labor:'劳务',other:'其他'};
export const money=cents=>(cents/100).toFixed(2);
export function parseMoney(value){const m=String(value??'').trim().replace(/[,，]/g,'').match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);if(!m)throw Error('金额须为正数，最多两位小数');const cents=Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));if(cents<=0)throw Error('金额须大于0');return cents;}
export const mealPeople=cents=>Math.ceil(cents/4000);
export function validDate(date){const d=new Date(date+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===date;}
export function dateText(date){if(!validDate(date))throw Error('日期无效');const [y,m,d]=date.split('-');return `${y}年${Number(m)}月${Number(d)}日`;}
export function chineseMoney(cents){
 const digit='零壹贰叁肆伍陆柒捌玖',small=['','拾','佰','仟'],large=['','万','亿'];
 const group=n=>{let out='',zero=false;for(let p=3;p>=0;p--){const d=Math.floor(n/10**p)%10;if(d){if(zero)out+='零';out+=digit[d]+small[p];zero=false;}else if(out)zero=true;}return out;};
 let whole=Math.floor(cents/100),parts=[],i=0;
 while(whole){parts.unshift({n:whole%10000,i});whole=Math.floor(whole/10000);i++;}
 let out='',gap=false;for(const p of parts){if(!p.n){if(out)gap=true;continue;}if(out&&(gap||p.n<1000))out+='零';out+=group(p.n)+large[p.i];gap=false;}
 out=(out||'零')+'元';const j=Math.floor(cents%100/10),f=cents%10;return out+(j?digit[j]+'角':f?'零':'')+(f?digit[f]+'分':j?'':'整');
}
export function statement(d){
 const who=d.payee+'（学工号：'+d.payeeId+'）',amount=money(d.amountCents),date=dateText(d.eventDate),responsible=d.principal?'费用负责人：'+d.principal+(d.principalId?'（工号：'+d.principalId+'）':'')+'。':'';
 let value='';
 if(d.category==='transport')value=`${d.department}于${date}因${d.purpose}，从${d.from}乘车至${d.to}，产生交通费${amount}元。领款人：${who}。`;
 else if(d.category==='courier')value=`${d.department}于${date}因${d.purpose}，从${d.from}向${d.to}寄送物品，产生快递费${amount}元。领款人：${who}。`;
 else if(d.category==='meal')value=`校团委${d.department}于${date}在${d.location}开展${d.purpose}，相关人员需用加班工作餐，按金额及40元/人标准填报${mealPeople(d.amountCents)}人，实际产生费用${amount}元。领款人：${who}。`;
 else if(d.category==='labor')value=`校团委${d.department}于${date}${d.location?'在'+d.location:''}开展${d.purpose}，拟向${who}发放劳务费${amount}元。`;
 else value=`校团委${d.department}于${date}${d.location?'在'+d.location:''}开展${d.purpose}，产生${d.category==='supplies'?'物资购买':'相关'}费用${amount}元。领款人：${who}。`;
 return value+responsible;
}
export function requirements(category){return ['invoice',...(['transport','courier'].includes(category)?['itinerary']:[]),...(['supplies','meal'].includes(category)?['order']:[]),...(category==='meal'?['receipt']:[])].filter(k=>k!=='invoice'||!['labor','other'].includes(category));}
export const attachmentLabels={invoice:'发票',itinerary:'行程单',order:'订单截图',receipt:'小票照片',extra:'其他附件'};
export function validate(d,files){
 const missing=[];if(!categories[d.category])missing.push('费用类别');
 for(const [key,label]of Object.entries({purpose:'具体事由',payee:'领款人',payeeId:'领款人学号或工号',fund:'经费号',department:'部门'}))if(!String(d[key]||'').trim())missing.push(label);
 if(!validDate(d.eventDate))missing.push(d.category==='meal'?'有效用餐日期':'有效费用发生日期');if(!validDate(d.documentDate))missing.push('有效材料落款日期');if(!Number.isSafeInteger(d.amountCents)||d.amountCents<=0)missing.push('正确金额');
 if(['transport','courier'].includes(d.category)){if(!d.from?.trim())missing.push('出发地或寄出地');if(!d.to?.trim())missing.push('目的地或收件单位');}
 if(d.category==='meal'&&!d.location?.trim())missing.push('用餐或工作地点');
 for(const kind of requirements(d.category))if(!files.some(f=>f.kind===kind))missing.push(attachmentLabels[kind]);
 const invoices=files.filter(f=>f.kind==='invoice');if(invoices.length){try{if(invoices.reduce((n,f)=>n+parseMoney(f.amount),0)!==d.amountCents)missing.push('逐张发票金额与总金额一致');}catch{missing.push('逐张发票的正确金额');}}
 if(!d.confirmed)missing.push('核对发票金额及填写内容');
 if(d.category==='other'&&!d.otherConfirmed)missing.push('确认其他费用所需材料');
 return missing;
}
export function parseInvoice(raw){
 const source=String(raw||'').normalize('NFKC'),compact=source.replace(/[\t ]/g,''),warnings=[];
 const dateMatch=compact.match(/(?:开票日期|开具日期|日期)[:：]?(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})日?/);
 const date=dateMatch?dateMatch[1]+'-'+dateMatch[2].padStart(2,'0')+'-'+dateMatch[3].padStart(2,'0'):'';
 const code=compact.match(/发票(?:号码|号)[:：]?([0-9]{8,30})/);
 let amount='';const matches=[];
 // Prefer explicitly labelled gross totals; never substitute bank-account or tax numbers.
 for(const re of [/(?:价税合计[^\n]{0,50}?(?:小写|[¥￥]))[^\d\n\-−]{0,8}([\d,]+\.\d{2})/g,/(?:小写)[^\d\n\-−]{0,8}([\d,]+\.\d{2})/g,/(?:价税合计|票价|实付金额|合计金额|总金额)[:：¥￥]*([\d,]+\.\d{2})/g]){
  for(const m of compact.matchAll(re))try{matches.push(parseMoney(m[1]));}catch{}
  if(matches.length)break;
 }
 const unique=[...new Set(matches)];if(unique.length===1)amount=money(unique[0]);else warnings.push(unique.length?'检测到多个不同的总额，请核对':'未可靠识别价税合计，请按发票填写金额');
 let category='';if(/餐饮|餐费|工作餐|餐饮服务/.test(source))category='meal';else if(/快递|收派服务|寄递服务/.test(source))category='courier';else if(/出租|客运|客运服务|交通运输|网约车|车票/.test(source))category='transport';else if(/文具|办公用品|打印|印刷|物资|日用|横幅/.test(source))category='supplies';
 return {date:validDate(date)?date:'',amount,invoiceNumber:code?.[1]||'',category,warnings};
}
