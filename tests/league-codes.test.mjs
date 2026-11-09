import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareDepartmentCode,rowsFor,unitCodes} from '../features/league/model.mjs';
const data=JSON.parse(readFileSync(new URL('../features/league/data.json',import.meta.url),'utf8'));
test('confirmed codes are consistent in undergraduate, graduate and combined views',()=>{
 for(const [name,code] of [['集成电路科学与工程学院','41'],['医学科学与工程学院','45']]){
  assert(data.records.filter(r=>r.college===name).every(r=>r.code===code));
  for(const kind of ['本科生','研究生','combined']){const rows=rowsFor(data,{kind,search:code});const row=rows.find(r=>r.college===name);assert.equal(row?.code,code);}
 }
 assert(!rowsFor(data,{kind:'combined',search:'42'}).some(r=>r.college==='集成电路科学与工程学院'));
});
test('department ordering is numeric, with unresolved codes at the end',()=>{
 const rows=[
  {code:'',college:'无系号单位'},
  {code:'45 / 3',college:'多系号单位'},
  {code:'12',college:'十二系'},
  {code:'2',college:'二系'}
 ];
 assert.deepEqual(rows.sort(compareDepartmentCode).map(row=>row.code),['2','45 / 3','12','']);
 assert.equal(unitCodes(data.records).get('杭州北航国际创新研究院'),'57');
});
