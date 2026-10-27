import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {preparePeople,plan,dateRange,customDates,hours} from '../features/hours/core.mjs';
import {readTemplate,readPeople,readHistory,exportTemplate,reportWorkbook} from '../features/hours/io.mjs';
const require=createRequire(import.meta.url),ExcelJS=require('../features/hours/vendor/exceljs-4.4.0.min.js');
const make=(name,h=10,student='S1',id='wrong')=>({name,hours:h,student,volunteerId:id,source:'虚构资料 / 第2行',original:{},rawHours:String(h)});
const template=(uid,rows,dates=['2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18'])=>({uid,label:String(uid+1),rows:rows.map(([name,id],i)=>({name,id,row:i+3})),dates});
test('dates respect ascending, descending and explicit order',()=>{
 assert.deepEqual(dateRange('2026-10-21','2026-10-23','desc'),['2026-10-23','2026-10-22','2026-10-21']);
 assert.deepEqual(customDates('2026-10-23,2026-10-21'),['2026-10-23','2026-10-21']);
 assert.throws(()=>customDates('2026-10-23,2026-10-23'));
 assert.throws(()=>dateRange('2026-02-30','2026-03-02'));
 assert.equal(hours('100cc'),null);assert.equal(hours('2.5小时'),2.5);
 assert.equal(hours('1.00001'),null);
});
test('unique name uses template identifier and splits 40h into five 8h files',()=>{
 const r=plan(preparePeople([make('测试甲',40)]),[template(0,[['测试甲','1540490507191320576']])]);
 assert.equal(r.entries[0].match.id,'1540490507191320576');
 assert.deepEqual(r.files.map(f=>f.hours),[8,8,8,8,8]);assert.equal(r.pending,0);
});
test('template order precedes dates; fourth group may run backwards',()=>{
 const a=template(0,[['测试甲','1001']]),b=template(3,[['测试乙','1002']],dateRange('2026-10-21','2026-10-23','desc'));
 const r=plan(preparePeople([make('测试甲',10),make('测试乙',20,'S2')]),[a,b]);
 assert.deepEqual(r.files.map(f=>[f.label,f.date,f.hours]),[['1','2026-10-14',8],['1','2026-10-15',2],['4','2026-10-23',8],['4','2026-10-22',8],['4','2026-10-21',4]]);
});
test('duplicate names require a unique identity; different hours are never equalized',()=>{
 const people=preparePeople([make('同名',10,'S1','1001'),make('同名',20,'S2','1002')]);
 const r=plan(people,[template(0,[['同名','1001'],['同名','1002']])]);
 assert.equal(r.prepared,30);assert.deepEqual(r.entries.map(e=>e.match.id),['1001','1002']);
 const unknown=plan(preparePeople([make('同名',10)]),[template(0,[['同名','1001'],['同名','1002']])]);
 assert.equal(unknown.prepared,0);assert.equal(unknown.pending,10);
 const confirmed=plan(preparePeople([make('同名',10)]),[template(0,[['同名','1001'],['同名','1002']])],new Set(),{'0':'1002'});
 assert.equal(confirmed.prepared,10);
});
test('no match and inadequate dates preserve every remaining hour',()=>{
 const r=plan(preparePeople([make('缺失',2.5),make('测试甲',20,'S2')]),[template(0,[['测试甲','1001']],['2026-10-14'])]);
 assert.equal(r.prepared,8);assert.equal(r.pending,14.5);assert.equal(r.total,22.5);
});
test('history blocks the whole previously used person-day, even if earlier hours were under 8',()=>{
 const r=plan(preparePeople([make('测试甲',10)]),[template(0,[['测试甲','1001']])],new Set(['1001|2026-10-14']));
 assert.deepEqual(r.files.map(f=>f.date),['2026-10-15','2026-10-16']);
});
test('a person in several templates is assigned only once, to the first template',()=>{
 const r=plan(preparePeople([make('测试甲')]),[template(3,[['测试甲','1001']]),template(0,[['测试甲','1001']])]);
 assert.equal(r.prepared,10);assert.equal(r.files[0].template,3);
});
test('exact repeated identity/hours is deduplicated; conflicting sources and identity collisions stop matching',()=>{
 assert.equal(preparePeople([make('甲'),make('甲')]).length,1);
 const conflicting=preparePeople([make('甲'),make('甲',20)]);
 assert.equal(plan(conflicting,[template(0,[['甲','1001']])]).prepared,0);
 const sameName=preparePeople([make('甲',10,'S1'),make('甲',20,'S2')]);
 assert.equal(plan(sameName,[template(0,[['甲','1001']])]).prepared,0);
});
test('unrecognizable hours stay visible, can be manually corrected, and reconcile fractional values',()=>{
 const p=preparePeople([make('甲','100cc')]),t=[template(0,[['甲','1001']])];
 const initial=plan(p,t);assert.equal(initial.invalid,1);assert(initial.entries[0].reason);
 assert.equal(plan(p,t,new Set(),{}, {'0':'5'}).prepared,5);
 const half=plan(preparePeople([make('甲',8.125)]),t);assert.equal(half.prepared,8.125);assert.equal(half.files[1].hours,0.125);
});
test('xlsx round trip preserves long text IDs, headers, merges, other sheets, styles, blank rows, dates and totals',async()=>{
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('批量时长导入');
 sheet.mergeCells('A1:D1');sheet.getCell('A1').value='虚构模板说明';sheet.getRow(2).values=['姓名','志愿者编号','活动日期','录入时长(小时)'];
 sheet.getRow(3).values=['测试甲','1540490507191320576','2026-10-09',3];sheet.getRow(4).values=['测试乙','1002','2026-10-09',4];
 sheet.getCell('B3').numFmt='@';sheet.getCell('A3').font={bold:true};sheet.getColumn(2).width=31;sheet.getRow(3).height=28;wb.addWorksheet('额外说明').getCell('A1').value='保留';
 const buffer=await wb.xlsx.writeBuffer(),t={...readTemplate(wb,'1_模板.xlsx',0),buffer,dates:['2026-10-21','2026-10-22','2026-10-23']};
 const p=preparePeople([make('测试甲',10)]),r=plan(p,[t]),output=await exportTemplate(t,r.files[0],ExcelJS),back=new ExcelJS.Workbook();await back.xlsx.load(output);
 const actual=back.getWorksheet('批量时长导入');assert.equal(actual.getCell('B3').value,'1540490507191320576');assert.equal(actual.getCell('B3').numFmt,'@');assert.equal(actual.getCell('D3').value,8);assert.equal(actual.getCell('D4').value,null);assert.equal(actual.getCell('C4').value,'2026-10-21');assert.equal(actual.getCell('D1').value,'虚构模板说明');assert.equal(actual.getCell('A3').font.bold,true);assert.equal(actual.getColumn(2).width,31);assert.equal(actual.getRow(3).height,28);assert.equal(back.getWorksheet('额外说明').getCell('A1').value,'保留');
 assert.deepEqual(readHistory(back,'历史.xlsx'),['1540490507191320576|2026-10-21']);
 const report=await reportWorkbook(r,ExcelJS),check=new ExcelJS.Workbook();await check.xlsx.load(report);assert.equal(check.getWorksheet('全部人员核对').getCell('I2').value,'1540490507191320576');
});
test('list header selection retains identity/contact/extra source columns',()=>{
 const wb=new ExcelJS.Workbook(),s=wb.addWorksheet('资料');s.getRow(2).values=['姓名','学号','身份证号码','手机号码','拟录入时长（小时）','学院'];s.getRow(3).values=['测试甲','S1','110101200001010011','13800000000',2.5,'虚构学院'];
 const p=readPeople(wb,'资料',2,{name:1,student:2,card:3,phone:4,hours:5},'虚构.xlsx');assert.equal(p[0].card,'110101200001010011');assert.equal(p[0].original['学院'],'虚构学院');
});
