import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {normalizeName, normalizeRecord, personalProfileCounts, samePersonalName, select,verified,groupUnits} from '../features/awards/model.mjs';
const d=JSON.parse(readFileSync(new URL('../features/awards/data.json',import.meta.url),'utf8'));
test('school rosters reconcile to primary notices, not applicant lists',()=>{
  const categories=['十佳志愿者','优秀志愿服务项目','优秀志愿者'];
  const counts=[
    ['2021',[10,10,305],'已公布结果'], ['2022',[10,11,344],'结果公示'],
    ['2023',[10,10,367],'结果公示'], ['2024',[10,10,282],'结果公示'],
    ['2025',[10,10,255],'结果公示'], ['2026',[10,10,279],'结果公示']
  ];
  for(const [year,expected,status] of counts){
    const categoriesForYear=categories.map(award=>select(d.records,{year,level:'校级',award:'北京航空航天大学'+award}));
    assert.deepEqual(categoriesForYear.map(rows=>rows.length),expected);
    assert(categoriesForYear.flat().every(row=>row.status===status));
  }
  assert(d.records.every(r=>r.school==='北京航空航天大学'&&d.sources.some(s=>s.id===r.source)&&r.locator&&r.name));
  assert.equal(new Set(d.records.map(r=>r.id)).size,d.records.length);
});
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
test('the 2026 five-star roster contains documented recipients with complete profiles',()=>{
  const stars=select(d.records,{year:'2026',award:'北京市五星级志愿者'});
  assert.equal(stars.length,10);
  assert.equal(d.fiveStarBatches['2026'].recognized,stars.length);
  assert.equal(d.fiveStarBatches['2026'].recommended,undefined);
  assert(stars.every(row=>verified(row)&&row.batch==='第十二批'&&row.studentId&&row.unit));
  assert.equal(stars.find(row=>row.name==='李昂轩')?.unit,'自动化科学与电气工程学院');
  assert.equal(stars.find(row=>row.name==='李逸晖')?.unit,'计算机学院');
});
test('same-year results keep award categories together and order actual contest medals',()=>{
  const rows=select(d.records,{year:'2026'});
  assert.deepEqual([...new Set(rows.map(r=>r.level))],['市级','区级','校级']);
  const contest=rows.filter(r=>r.award==='海淀区志愿服务项目大赛');
  assert.deepEqual(contest.map(r=>r.grade||r.honor),['铜奖','最佳组织奖']);
  assert(!contest[1].grade);
  for(const year of ['2020','2021']){
    const top=select(d.records,{year,award:'北京航空航天大学十佳志愿者'});
    assert.equal(top.length,10);
  }
  assert.equal(select(d.records,{search:'晏丽'}).filter(r=>r.id==='a9').length,1);
});
test('student IDs retain evidence while private registration and contact fields stay excluded',()=>{
  const enriched=d.records.filter(row=>row.studentId);
  assert(enriched.length>0);
  for(const row of enriched){
    assert.equal(row.kind,'个人');
    assert.match(row.studentId,/^[A-Z]{0,3}\d{7,11}$/);
    assert(d.sources.some(source=>source.id===row.studentIdSource));
    assert(row.studentIdLocator&&row.studentIdMatch);
  }
  assert(select(d.records,{search:enriched[0].studentId}).some(result=>result.id===enriched[0].id));
  const schoolRoster=select(d.records,{year:'2026',level:'校级'})
    .filter(row=>['北京航空航天大学优秀志愿者','北京航空航天大学十佳志愿者','北京航空航天大学优秀志愿服务项目'].includes(row.award));
  for(const row of schoolRoster.filter(row=>row.kind==='个人')){
    assert(row.studentId&&row.unit);
    assert.equal(row.studentIdEvidenceYear,2026);
    assert.equal(d.sources.find(source=>source.id===row.studentIdSource)?.file,'2026志愿服务评奖表彰审核.xlsx');
  }
  assert(schoolRoster.filter(row=>row.kind==='项目').every(row=>row.leader&&row.leaderSource));
  for(const row of d.records)for(const key of ['idCard','phone','birth','volunteerId'])assert(!Object.hasOwn(row,key));
  assert(!JSON.stringify(d.records).match(/\b\d{17}[\dX]\b/));
});
test('Chinese name spacing is normalized in search and output without changing distinct records or Latin name spacing',()=>{
  const spaced={id:'spaced',kind:'个人',name:'晏　\u200b丽',year:2025,award:'优秀志愿者',unit:'学院',studentId:'12345678'};
  const sameName={...spaced,id:'homonym',name:'晏 丽',studentId:'87654321'};
  const project={id:'project',kind:'项目',name:'A B 项目',leader:'李 \n阳'};
  for(const query of ['晏丽','晏 丽','晏　丽','晏\n丽']){
    const matches=select([spaced,sameName],{search:query});
    assert.equal(matches.length,2);
    assert(matches.every(row=>row.name==='晏丽'));
    assert.deepEqual(new Set(matches.map(row=>row.studentId)),new Set(['12345678','87654321']));
  }
  assert(samePersonalName(spaced,sameName));
  assert.equal(normalizeName('朱 妮 妮（Zhu Isabella）'),'朱妮妮（Zhu Isabella）');
  assert.equal(normalizeName('热依拉木 · 阿布来提'),'热依拉木·阿布来提');
  assert.deepEqual(normalizeRecord(project),{...project,leader:'李阳'});
  assert.equal(spaced.name,'晏　\u200b丽');
  assert(!select([{...spaced,name:'Ann A'}],{search:'Anna'}).length);
});
test('personal awards use colleges and profile filters reconcile with visible gaps',()=>{
  const colleges=new Set(JSON.parse(readFileSync(new URL('../features/office/colleges.json',import.meta.url),'utf8')).map(row=>row.name));
  const personal=d.records.filter(row=>row.kind==='个人');
  const staff=personal.filter(row=>row.studentIdNotApplicable);
  assert.equal(staff.length,2);
  assert(staff.every(row=>row.unit&&!row.studentId&&row.unitSource&&row.unitLocator));
  assert(personal.every(row=>!row.unit||colleges.has(row.unit)||row.studentIdNotApplicable));
  const counts=personalProfileCounts(d.records);
  assert.equal(counts.total,personal.length);
  assert.equal(select(d.records,{profile:'missingStudentId'}).length,counts.missingStudentId);
  assert(select(d.records,{profile:'missingStudentId'}).every(row=>!row.studentIdNotApplicable));
  assert.equal(select(d.records,{unit:'校团委',search:'孟宪博'}).length,1);
  assert.equal(select(d.records,{profile:'missingCollege'}).length,counts.missingCollege);
  assert(!groupUnits(personal).some(unit=>unit.name==='北京航空航天大学'));
  const stars=personal.filter(row=>/^海淀区[一二三四]星级/.test(row.award));
  for(const row of stars.filter(row=>row.unit)){
    assert(row.unitSource&&row.unitLocator);
    assert(d.sources.some(source=>source.id===row.unitSource));
  }
});
