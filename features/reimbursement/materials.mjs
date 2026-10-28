import {money,chineseMoney,mealPeople,statement,categories,validate,attachmentLabels,dateText} from './domain.mjs';
export const escapeXml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function fillDocx(buffer,values,JSZip,pictures=[]){
 const zip=await JSZip.loadAsync(buffer);let xml=await zip.file('word/document.xml').async('string');
 xml=xml.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{if(!Object.hasOwn(values,key))throw Error('缺少文档字段 '+key);return escapeXml(values[key]);});
 if(pictures.length){
  let rels=await zip.file('word/_rels/document.xml.rels').async('string'),types=await zip.file('[Content_Types].xml').async('string'),body='';
  const root=xml.match(/<w:document\b[^>]*>/)[0];
  for(const [prefix,url]of Object.entries({r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',wp:'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',a:'http://schemas.openxmlformats.org/drawingml/2006/main',pic:'http://schemas.openxmlformats.org/drawingml/2006/picture'}))if(!root.includes('xmlns:'+prefix+'='))xml=xml.replace('<w:document ',`<w:document xmlns:${prefix}="${url}" `);
  for(const [i,p]of pictures.entries()){
   const id='rIdExpenseImage'+i,name=`expense-image-${i}.png`,scale=Math.min(5029200/p.width,2926080/p.height),cx=Math.round(p.width*scale),cy=Math.round(p.height*scale);
   zip.file('word/media/'+name,p.bytes);
   rels=rels.replace('</Relationships>',`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/></Relationships>`);
   body+=`<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(p.label)}：</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${100+i}" name="附件${i+1}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${100+i}" name="附件${i+1}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  const paragraphs=[...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter(m=>m[0].replace(/<[^>]+>/g,'').includes('特此说明'));
  if(paragraphs.length!==1)throw Error('情况说明模板的落款位置无法确定');const position=paragraphs[0].index;xml=xml.slice(0,position)+body+xml.slice(position);
  if(!/Extension="png"/.test(types))types=types.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
  zip.file('word/_rels/document.xml.rels',rels);zip.file('[Content_Types].xml',types);
 }
 if(/\{\{[A-Z_]+\}\}/.test(xml))throw Error('文档存在未填写字段');zip.file('word/document.xml',xml);return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
export async function voucher(d,buffer,JSZip){return fillDocx(buffer,{DEPARTMENT:d.department,FUND:d.fund,DATE:dateText(d.documentDate),PRINCIPAL:d.principal||'',ACCEPTOR:d.acceptor||'',PERSON:'',PURPOSE:d.purpose,PERSON_ID:d.payee+'（'+d.payeeId+'）',AMOUNT:money(d.amountCents),CAPITAL:chineseMoney(d.amountCents),AMOUNT_YUAN:money(d.amountCents)+'元',YEAR:d.documentDate.slice(0,4),EMPTY:''},JSZip);}
export async function mealApproval(d,buffer,ExcelJS){
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const s=wb.worksheets[0];
 for(const [cell,value]of Object.entries({D3:'校团委'+d.department,H3:dateText(d.eventDate),D4:null,D5:mealPeople(d.amountCents),H5:d.amountCents/100,D6:d.purpose,D9:'单位正职领导签字并加盖公章：\n\n                           '+dateText(d.documentDate)+'\n'}))s.getCell(cell).value=value;
 s.getCell('H5').style={...s.getCell('H5').style,numFmt:'0.00'};s.getCell('D5').style={...s.getCell('D5').style,numFmt:'0'};s.pageSetup={...s.pageSetup,printArea:'A2:I11',fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:9,orientation:'portrait'};
 return wb.xlsx.writeBuffer();
}
export async function materialPackage(d,files,{JSZip,ExcelJS,templates,pictures=[]}){
 const missing=validate(d,files);if(missing.length)throw Error('还需填写或上传：'+missing.join('、'));
 const zip=new JSZip(),safe=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100),folder=zip.folder(safe(d.purpose).slice(0,45)+'_报销材料');
 folder.file('01_报销明细单.docx',await voucher(d,templates.voucher,JSZip));
 folder.file('02_'+categories[d.category]+'情况说明.docx',await fillDocx(templates.statement,{STATEMENT:statement(d),DATE:dateText(d.documentDate)},JSZip,pictures));
 if(d.category==='meal')folder.file('03_加班用餐费用报销审核单.xlsx',await mealApproval(d,templates.meal,ExcelJS));
 for(const [i,f]of files.entries())folder.file('附件/'+String(i+1).padStart(2,'0')+'_'+attachmentLabels[f.kind]+'_'+safe(f.name),f.bytes);
 const notes=[`事项：${d.purpose}`,`类别：${categories[d.category]}；${d.category==='meal'?'用餐日期':'费用发生日期'}：${dateText(d.eventDate)}；材料落款日期：${dateText(d.documentDate)}；本次金额：${money(d.amountCents)}元。`,`领款人：${d.payee}（${d.payeeId}）；部门：${d.department}；经费号：${d.fund}。`,'已自动填写报销明细单和对应情况说明。',...(d.category==='meal'?[`加班餐审批表已填写；人数按金额÷40向上取整，为${mealPeople(d.amountCents)}人。请办理实际审批签字盖章；本包不生成签名或印章。`]:[]),...(['transport','courier'].includes(d.category)?['行程单仍需按要求手写费用说明，参考“行程单待手写文字.txt”。']:[]),'负责人审核、验收人及领款人签字按实际办理。生成文件不代表已提交或审核通过。'];
 folder.file('00_材料核对说明.txt','\uFEFF'+notes.join('\r\n'));
 if(['transport','courier'].includes(d.category))folder.file('行程单待手写文字.txt','\uFEFF'+statement(d)+'\r\n请按要求手写到行程单上。');
 folder.file('本次填写信息.json',JSON.stringify({...d,invoices:files.filter(f=>f.kind==='invoice').map(f=>({name:f.name,invoiceNumber:f.invoiceNumber||'',amount:f.amount||'',sha256:f.hash}))},null,2));
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:4}});
}
