import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {select,verified,groupUnits} from '../features/awards/model.mjs';
const d=JSON.parse(readFileSync(new URL('../features/awards/data.json',import.meta.url),'utf8'));
test('school rosters reconcile to primary notices, not applicant lists',()=>{for(const [year,n] of [[2023,367],[2024,282],[2025,255]]){assert.equal(select(d.records,{year:String(year),award:'北京航空航天大学优秀志愿者'}).length,n);for(const a of ['十佳志愿者','优秀志愿服务项目'])assert.equal(select(d.records,{year:String(year),award:'北京航空航天大学'+a}).length,10)}assert(d.records.every(r=>r.school==='北京航空航天大学'&&d.sources.some(s=>s.id===r.source)&&r.locator&&r.name));assert.equal(new Set(d.records.map(r=>r.id)).size,d.records.length)});
test('uncertain results stay out of verified totals, award years do not become publication years',()=>{
  const ok=select(d.records,{status:'verified'});
  assert(ok.every(verified));
  assert(!ok.some(r=>r.status==='候选公示'));
  assert.equal(d.records.find(r=>r.award==='北京市志愿服务项目大赛').year,2016);
  const stars=ok.filter(r=>/^海淀区[一二三四]星级/.test(r.award));
  for(const [year,n,published] of [[2024,838,'2025-08-11'],[2025,900,'2026-05-06']]){
    const batch=stars.filter(r=>r.year===year);
    assert.equal(batch.length,n);
    assert(batch.every(r=>r.published===published));
  }
  assert.equal(groupUnits(ok).reduce((n,r)=>n+r.total,0),ok.length);
});
test('same-year results keep award categories together and order actual contest medals',()=>{
  const rows=select(d.records,{year:'2026'});
  assert.deepEqual([...new Set(rows.map(r=>r.level))],['市级','区级']);
  const contest=rows.filter(r=>r.award==='海淀区志愿服务项目大赛');
  assert.deepEqual(contest.map(r=>r.grade||r.honor),['铜奖','最佳组织奖']);
  assert(!contest[1].grade);
  for(const year of ['2020','2021']){
    const top=select(d.records,{year,award:'北京航空航天大学十佳志愿者'});
    assert.equal(top.length,10);
  }
  assert.equal(select(d.records,{search:'晏丽'}).filter(r=>r.id==='a9').length,1);
});
test('public archive has no personal registration or contact fields',()=>{for(const r of d.records)for(const k of ['idCard','phone','birth','volunteerId','studentId'])assert(!Object.hasOwn(r,k));assert(!JSON.stringify(d.records).match(/\b\d{17}[\dX]\b/));});
