import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {parseInvoice,parseMoney,money,mealPeople,chineseMoney,validate,statement} from '../features/reimbursement/domain.mjs';
import {voucher,fillDocx,mealApproval,materialPackage} from '../features/reimbursement/materials.mjs';
const require=createRequire(import.meta.url),JSZip=require('../features/hours/vendor/jszip-3.10.1.min.js'),ExcelJS=require('../features/hours/vendor/exceljs-4.4.0.min.js');
const d={category:'meal',department:'志愿者工作部',fund:'TEST001',date:'2026-10-27',person:'虚构经办人',studentId:'TEST2026',purpose:'虚构活动工作餐测试',amountCents:27970,location:'测试会议室',principal:'',acceptor:'',from:'测试起点',to:'测试终点',confirmed:true};
const templates={};for(const [key,name]of Object.entries({voucher:'voucher.docx',statement:'statement.docx',meal:'meal.xlsx'}))templates[key]=await fs.readFile(new URL('../features/reimbursement/templates/'+name,import.meta.url));
test('invoice parser uses gross total, date and invoice number, with no bank-number fallback',()=>{
 const p=parseInvoice('开票日期：2026年10月27日\n发票号码：12345678901234567890\n餐饮服务 263.87\n价税合计(大写)贰佰柒拾玖元柒角 (小写)¥279.70\n开户行账号123456789012');
 assert.equal(p.amount,'279.70');assert.equal(p.date,'2026-10-27');assert.equal(p.category,'meal');assert.equal(p.invoiceNumber,'12345678901234567890');
 assert.equal(parseInvoice('开户行:123456789012345678\n税额:30.00').amount,'');
 assert.equal(parseInvoice('小写￥100.00\n小写￥200.00').amount,'');
 assert.equal(parseInvoice('价 税 合计 (小 写 ) 兰 279.70').amount,'279.70');
 assert.equal(parseInvoice('价税合计（小写）￥-279.70').amount,'');
});
test('money and meal headcount are cent-accurate; amounts in uppercase are complete',()=>{
 assert.equal(parseMoney('279.70'),27970);assert.equal(mealPeople(27970),7);assert.equal(mealPeople(4001),2);assert.equal(mealPeople(8000),2);assert.equal(mealPeople(30000),8);
 assert.equal(chineseMoney(100010001),'壹佰万零壹佰元零壹分');assert.equal(chineseMoney(27970),'贰佰柒拾玖元柒角');assert.equal(chineseMoney(100),'壹元整');assert.throws(()=>parseMoney('-1'));assert.throws(()=>parseMoney('12.345'));
});
test('mandatory attachments and invoice totals are enforced; generated approval is not another upload',()=>{
 const invoice={kind:'invoice',amount:'279.70'},files=[invoice,{kind:'order'},{kind:'receipt'}];assert.deepEqual(validate(d,files),[]);
 assert(validate(d,[invoice]).includes('订单截图'));assert(validate({...d,amountCents:1},files).includes('逐张发票金额与总金额一致'));
 assert.deepEqual(validate({...d,category:'labor'},[]),[]);assert(validate({...d,category:'transport'},[invoice]).includes('行程单'));
 assert(!statement(d).includes('付强'));assert(statement(d).includes('7人'));
});
test('voucher preserves template package and fills amount, employee, fund and year without example names',async()=>{
 const bytes=await voucher(d,templates.voucher,JSZip),z=await JSZip.loadAsync(bytes),xml=await z.file('word/document.xml').async('string');
 for(const value of ['虚构经办人','TEST2026','279.70','贰佰柒拾玖元柒角','TEST001'])assert(xml.includes(value));assert(!xml.includes('{{'));assert(!xml.includes('刘浩宇'));assert(!z.file('docProps/thumbnail.emf'));
 const original=await JSZip.loadAsync(templates.voucher);for(const name of Object.keys(original.files).filter(n=>!original.files[n].dir&&n!=='word/document.xml'))assert.deepEqual(await z.file(name).async('uint8array'),await original.file(name).async('uint8array'));
});
test('statement embeds real uploaded picture bytes, relationships and content types',async()=>{
 const picture={width:10,height:10,label:'虚构订单截图',bytes:new Uint8Array([1,2,3])},bytes=await fillDocx(templates.statement,{STATEMENT:statement(d),DATE:'2026年10月27日'},JSZip,[picture]),z=await JSZip.loadAsync(bytes),xml=await z.file('word/document.xml').async('string');
 assert(xml.includes('虚构订单截图'));assert(xml.includes('rIdExpenseImage0'));assert(z.file('word/media/expense-image-0.png'));assert(!xml.includes('{{'));assert((await z.file('[Content_Types].xml').async('string')).includes('image/png'));
 assert(xml.includes('w:lineRule="auto"'));
});
test('meal approval is filled in original merged layout, with no old contact/date and unsigned approval',async()=>{
 const bytes=await mealApproval(d,templates.meal,ExcelJS),wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);const s=wb.worksheets[0];assert.equal(s.getCell('D5').value,7);assert.equal(s.getCell('H5').value,279.7);assert.equal(s.getCell('D4').value,'虚构经办人');assert.equal(s.getCell('H3').value,'2026年10月27日');assert.equal(s.getCell('D6').value,d.purpose);assert(!s.getCell('D9').value.includes('2025'));assert(s.model.merges.includes('D9:H11'));
});
test('a complete meal package contains filled documents, approval, original attachments, and a record',async()=>{
 const files=['invoice','order','receipt'].map(kind=>({kind,name:kind+'.png',amount:kind==='invoice'?'279.70':'',bytes:new Uint8Array([1,2,3])}));const bytes=await materialPackage(d,files,{JSZip,ExcelJS,templates}),z=await JSZip.loadAsync(bytes),names=Object.keys(z.files);assert(names.some(n=>n.endsWith('01_报销明细单.docx')));assert(names.some(n=>n.endsWith('03_加班用餐费用报销审核单.xlsx')));assert.equal(names.filter(n=>n.includes('/附件/')&&!z.files[n].dir).length,3);
});
test('all self-hosted recognition assets retain their recorded checksums',async()=>{
 const root=new URL('../features/reimbursement/vendor/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
 for(const item of manifest){const bytes=await fs.readFile(new URL(item.file,root));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);}
});
