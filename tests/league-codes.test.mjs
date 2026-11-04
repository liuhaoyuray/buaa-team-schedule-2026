import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowsFor} from '../features/league/model.mjs';
const data=JSON.parse(readFileSync(new URL('../features/league/data.json',import.meta.url),'utf8'));
test('confirmed codes are consistent in undergraduate, graduate and combined views',()=>{
 for(const [name,code] of [['集成电路科学与工程学院','41'],['医学科学与工程学院','45']]){
  assert(data.records.filter(r=>r.college===name).every(r=>r.code===code));
  for(const kind of ['本科生','研究生','combined']){const rows=rowsFor(data,{kind,search:code});const row=rows.find(r=>r.college===name);assert.equal(row?.code,code);}
 }
 assert(!rowsFor(data,{kind:'combined',search:'42'}).some(r=>r.college==='集成电路科学与工程学院'));
});
