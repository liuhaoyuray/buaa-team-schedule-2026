(function(root){
  const DAY=86400000;
  function dateISO(d){return new Date(d).toISOString().slice(0,10)}
  function dayInfo(date,data,rules={}){
    const ms=Date.parse(date+'T00:00:00Z'),base=Date.parse(data.meta.week1+'T00:00:00Z');
    const week=Math.floor((ms-base)/DAY/7)+1,day=(new Date(ms).getUTCDay()+6)%7+1;
    const r=rules[date];return {date,week,day,courseWeek:r?.week?Number(r.week):week,courseDay:r?.day?Number(r.day):day,stop:r?.mode==='stop',special:r,valid:week>=1&&week<=data.meta.maxWeek};
  }
  const min=t=>{let [h,m]=t.split(':').map(Number);return h*60+m};
  function intersects(e,start,end){return min(e.start)<min(end)&&min(e.end)>min(start)}
  function evaluate(person,date,start,end,data,rules={},ownEvents){
    const info=dayInfo(date,data,rules); const own=ownEvents||data.events.filter(e=>e.person===person.id);
    if(!person.defaultNoClasses&&person.hasTimetable===false)return {status:'unknown',events:[],reasons:['尚未收集课表，请直接联系本人确认时间']};
    if(!info.valid||(!person.defaultNoClasses&&info.courseWeek>data.meta.teachingWeeks))return {status:'unknown',events:[],reasons:['未收集该日期的课程／考试安排']};
    let active=own.filter(e=>intersects(e,start,end)&&!(person.defaultNoClasses&&e.kind==='course')&&!(info.stop&&e.kind==='course')&&(e.date?e.date===date:(e.day===(e.kind==='course'?info.courseDay:info.day)&&(!e.weeks||e.weeks.includes(e.kind==='course'?info.courseWeek:info.week))&&!(e.excludeWeeks||[]).includes(e.kind==='course'?info.courseWeek:info.week))));
    const known=active.filter(e=>!e.uncertain),unknown=active.filter(e=>e.uncertain),reasons=[];
    if(!person.defaultNoClasses&&person.alwaysConfirm)reasons.push(person.alwaysConfirm);
    if(!person.defaultNoClasses&&person.emptyWeekConfirm&&!own.some(e=>e.kind==='course'&&e.weeks?.includes(info.courseWeek)))reasons.push(person.emptyWeekConfirm);
    if(!person.defaultNoClasses&&!info.special && ((date>='2026-09-25'&&date<='2026-09-27')||(date>='2026-10-01'&&date<='2026-10-07')))reasons.push('节假日教学安排未确认，可在校历设置中指定停课或补课');
    if(unknown.length)reasons.push(...unknown.map(e=>e.note||'原表未注明具体周次／时间'));
    let status=known.some(e=>e.kind==='course')?'course':known.length?'other':(reasons.length||unknown.length)?'unknown':'free';
    return {status,events:active,reasons:[...new Set(reasons)]};
  }
  function query(data,date,start,end,filters={},rules={}){
    return data.people.filter(p=>(filters.includeUnconfirmed||p.rosterStatus!=='not_in_roster')&&(!filters.department||p.department===filters.department)&&(!filters.campus||p.campus===filters.campus)&&(!filters.college||p.college===filters.college)&&(!filters.role||p.role===filters.role)&&(!filters.search||[p.name,p.department,p.campus,p.studentId,p.college,p.role,p.phone].some(v=>String(v||'').includes(filters.search)))).map(p=>({person:p,...evaluate(p,date,start,end,data,rules)}));
  }
  function findCommonSlots(data,options={},rules={}){
  const {ids=[],week=1,duration=60,start='08:00',end='22:00',days=[1,2,3,4,5,6,7],partial=false,limit=8}=options;
  const ps=data.people.filter(p=>p.rosterStatus!=='not_in_roster'&&new Set(ids).has(p.id));
  const from=min(start),to=min(end),length=Number(duration),w=Number(week);
  if(!ps.length||!Number.isInteger(w)||w<1||w>data.meta.maxWeek||!Number.isFinite(length)||length<15||length>840||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>1440||to-from<length)return [];
  const indexed=new Map(ps.map(p=>[p.id,[]]));for(const e of data.events)if(indexed.has(e.person))indexed.get(e.person).push(e);
  const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const candidates=[];
  for(const day of [...new Set(days.map(Number))].filter(d=>Number.isInteger(d)&&d>=1&&d<=7).sort((a,b)=>a-b)){
   const date=dateISO(Date.parse(data.meta.week1+'T00:00:00Z')+((w-1)*7+day-1)*DAY);
   for(let t=from;t+length<=to;t+=15){
    const a=fmt(t),b=fmt(t+length),results=ps.map(person=>({person,...evaluate(person,date,a,b,data,rules,indexed.get(person.id))})),free=results.filter(r=>r.status==='free').length;
    if(partial?free>0:free===ps.length)candidates.push({date,day,start:a,end:b,free,total:ps.length,unknown:results.filter(r=>r.status==='unknown').length,results});
   }
  }
  candidates.sort((a,b)=>b.free-a.free||a.unknown-b.unknown||a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  const chosen=[];for(const c of candidates){if(chosen.some(s=>s.date===c.date&&min(s.start)<min(c.end)&&min(s.end)>min(c.start)))continue;chosen.push(c);if(chosen.length>=Math.max(1,Math.min(30,Number(limit)||8)))break}return chosen;
 }

 const api={findCommonSlots,dateISO,dayInfo,min,intersects,evaluate,query,DAY};root.ScheduleEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

(function(root){
 'use strict';
 const E=root.ScheduleEngine,DEPTS=['志工部','实践部'],BLOCKS=[{label:'1–2节',start:'08:00',end:'09:35'},{label:'3–5节',start:'09:50',end:'12:15'},{label:'6–7节',start:'14:00',end:'15:35'},{label:'8–10节',start:'15:50',end:'18:15'}];
 const iso=n=>new Date(n).toISOString().slice(0,10),ms=s=>Date.parse(s+'T00:00:00Z');
 function gradeOf(p,override={},year=2026){
  if(override.grade)return {key:override.grade,label:({g1:'大一',g2:'大二',g3:'大三',g4:'大四及以上',grad:'研究生',unknown:'待确认'})[override.grade]||'待确认',basis:'手动核对'};
  const sid=String(p.studentId||'').trim();
  if(/^\d{8}$/.test(sid)){const entry=2000+Number(sid.slice(0,2)),g=year-entry+1;if(g>=1&&g<=8){const key='g'+Math.min(4,g);return {key,label:({g1:'大一',g2:'大二',g3:'大三',g4:'大四及以上'})[key],basis:'按学号入学年份推定'}}}
  if(/^[A-Za-z]+\d/.test(sid))return {key:'grad',label:'研究生',basis:'按学号前缀推定'};
  return {key:'unknown',label:'待确认',basis:'缺少年级依据'};
 }
 function profiles(data,overrides={}){return data.people.filter(p=>p.rosterStatus!=='not_in_roster').map(p=>{const o=overrides[p.id]||{},grade=gradeOf(p,o),campus=o.campus||p.campus||'待确认';return {person:p,grade,campus,campusBasis:o.campus?'手动核对':p.campusBasis||'资料未注明',excluded:!!o.exclude}})}
 function endDates(data){const base=ms(data.meta.week1);return {teaching:iso(base+data.meta.teachingWeeks*7*E.DAY-E.DAY),semester:iso(base+data.meta.maxWeek*7*E.DAY-E.DAY),duty:iso(base+(data.meta.dutyModule?.endWeek??data.meta.teachingWeeks)*7*E.DAY-E.DAY)}}
 function slotsFor(start,end){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||!Number.isFinite(ms(start))||ms(end)<ms(start)||ms(end)-ms(start)>366*E.DAY)throw Error('请选择有效的排班起止日期（范围不超过一年）');
  return Array.from({length:20},(_,index)=>{const day=Math.floor(index/4)+1,block=index%4,dates=[];for(let n=ms(start);n<=ms(end);n+=E.DAY)if((new Date(n).getUTCDay()+6)%7+1===day)dates.push(iso(n));return {index,day,block,...BLOCKS[block],dates}});
 }
 function eligibility(profile,campus){if(profile.excluded)return '已手动排除';if(profile.campus!==campus)return profile.campus==='待确认'?'校区待确认':'属于另一校区';if(profile.grade.key==='unknown')return '年级待确认';if(campus==='学院路'&&['g4','grad'].includes(profile.grade.key))return '学院路大四及研究生暂不排班';return ''}
 function availability(data,profile,slot,rules={},own=[]){
  if(!slot.dates.length)return {available:false,conflicts:[],reason:'有效期内没有对应星期'};
  const conflicts=[];for(const date of slot.dates){const r=E.evaluate(profile.person,date,slot.start,slot.end,data,rules,own);if(r.status!=='free')conflicts.push({date,status:r.status,titles:[...new Set(r.events.map(e=>e.title))],reasons:r.reasons})}
  return {available:!conflicts.length,conflicts,reason:conflicts.length?(conflicts[0].date+' '+(conflicts[0].titles.join('、')||conflicts[0].reasons.join('；'))):''};
 }
 class Flow{
  constructor(){this.g=[]}
  node(){this.g.push([]);return this.g.length-1}
  edge(a,b,cap,cost,tag){const e={to:b,cap,cost,rev:this.g[b].length,initial:cap,tag};this.g[a].push(e);this.g[b].push({to:a,cap:0,cost:-cost,rev:this.g[a].length-1,initial:0});return e}
  solve(source,sink,limit){let total=0,cost=0;while(total<limit){const dist=Array(this.g.length).fill(Infinity),prev=Array(this.g.length),queued=Array(this.g.length).fill(false),q=[source];let head=0;dist[source]=0;queued[source]=true;while(head<q.length){const v=q[head++];queued[v]=false;for(let i=0;i<this.g[v].length;i++){const e=this.g[v][i];if(e.cap>0&&dist[e.to]>dist[v]+e.cost){dist[e.to]=dist[v]+e.cost;prev[e.to]=[v,i];if(!queued[e.to]){q.push(e.to);queued[e.to]=true}}}}if(!prev[sink])break;let amount=limit-total;for(let v=sink;v!==source;v=prev[v][0])amount=Math.min(amount,this.g[prev[v][0]][prev[v][1]].cap);for(let v=sink;v!==source;v=prev[v][0]){const e=this.g[prev[v][0]][prev[v][1]];e.cap-=amount;this.g[v][e.rev].cap+=amount}total+=amount;cost+=amount*dist[sink]}return {total,cost}}
 }
 function pairPenalty(indices){if(indices.length<2)return 0;const [a,b]=indices,dayA=Math.floor(a/4),dayB=Math.floor(b/4);return (dayA===dayB?120:0)+(dayA===dayB&&Math.abs(a-b)===1?80:0)+(a%4===0&&b%4===0?60:0)}
 function improve(assignments,matrix,profileMap){
  let changed=true,pass=0;while(changed&&pass++<30){changed=false;for(let i=0;i<assignments.length;i++)for(let j=i+1;j<assignments.length;j++){const a=assignments[i],b=assignments[j];if(a.person===b.person||profileMap.get(a.person).person.department!==profileMap.get(b.person).person.department)continue;if(!matrix[a.person][b.slot].available||!matrix[b.person][a.slot].available)continue;const ownA=assignments.filter(x=>x.person===a.person),ownB=assignments.filter(x=>x.person===b.person);if(ownA.some(x=>x!==a&&x.slot===b.slot)||ownB.some(x=>x!==b&&x.slot===a.slot))continue;const afterA=ownA.map(x=>x===a?b.slot:x.slot),afterB=ownB.map(x=>x===b?a.slot:x.slot);if(afterA.filter(i=>i%4===0).length>1||afterB.filter(i=>i%4===0).length>1)continue;const before=pairPenalty(ownA.map(x=>x.slot))+pairPenalty(ownB.map(x=>x.slot)),after=pairPenalty(ownA.map(x=>x===a?b.slot:x.slot))+pairPenalty(ownB.map(x=>x===b?a.slot:x.slot));if(after<before){[a.slot,b.slot]=[b.slot,a.slot];changed=true}}}return assignments;
 }
 function generate(data,options={},rules={}){
  const campus=options.campus??'学院路',start=options.start??'2026-10-19',end=options.end??endDates(data).duty;if(!['学院路','沙河'].includes(campus))throw Error('请选择学院路或沙河校区');if(ms(end)>ms(endDates(data).duty))throw Error('第18–19周不值班，请将结束日期设在第17周以内');const slots=slotsFor(start,end),all=profiles(data,options.overrides||{}),included=all.filter(p=>!eligibility(p,campus)),profileMap=new Map(all.map(p=>[p.person.id,p])),own=new Map(all.map(p=>[p.person.id,[]]));for(const e of data.events)if(own.has(e.person))own.get(e.person).push(e);
  const matrix={};for(const p of included)matrix[p.person.id]=slots.map(s=>availability(data,p,s,rules,own.get(p.person.id)));
  const flow=new Flow(),source=flow.node(),sink=flow.node(),deptNodes={},slotNodes=slots.map(()=>flow.node()),deptSlots={};for(const dept of DEPTS){deptNodes[dept]=flow.node();for(let k=0;k<40;k++)flow.edge(source,deptNodes[dept],1,k<20?0:(k-19)*3000);deptSlots[dept]=slots.map((s,i)=>{const n=flow.node();flow.edge(n,slotNodes[i],1,-1000000000);flow.edge(n,slotNodes[i],1,0);return n})}
  // First cover every actual time window, then add colleagues. Convex costs
  // avoid leaving an entire window empty merely to create more paired cells.
  for(const n of slotNodes){flow.edge(n,sink,1,-10000000);flow.edge(n,sink,1,campus==='学院路'?-100000:0);flow.edge(n,sink,1,campus==='学院路'?0:1000);if(campus==='沙河')flow.edge(n,sink,1,10000)}
  const picks=[];const rotated=[...included].sort((a,b)=>a.person.id.localeCompare(b.person.id));if(rotated.length){const n=(options.seed||0)%rotated.length;rotated.push(...rotated.splice(0,n))}
  for(const p of rotated){const id=p.person.id,n=flow.node();const young=campus==='学院路'&&['g1','g2'].includes(p.grade.key);flow.edge(deptNodes[p.person.department],n,1,young?-30000000:-1000000);flow.edge(deptNodes[p.person.department],n,1,young?-20000000:campus==='学院路'&&p.grade.key==='g3'?0:-500000);const early=flow.node();flow.edge(n,early,1,0);const days=Array.from({length:5},()=>flow.node());for(const dn of days){flow.edge(n,dn,1,0);flow.edge(n,dn,1,5000)}for(const slot of slots)if(matrix[id][slot.index].available){const tie=(slot.index*7+(options.seed||0)*3)%17;const e=flow.edge(slot.block===0?early:days[slot.day-1],deptSlots[p.person.department][slot.index],1,tie,{person:id,slot:slot.index});picks.push(e)}}
  flow.solve(source,sink,campus==='学院路'?60:included.length*2);let assignments=picks.filter(e=>e.initial-e.cap>0).map(e=>({...e.tag}));assignments=improve(assignments,matrix,profileMap);assignments.sort((a,b)=>a.slot-b.slot||a.person.localeCompare(b.person));
  const grid=slots.map(s=>({...s,departments:Object.fromEntries(DEPTS.map(dept=>[dept,assignments.filter(a=>a.slot===s.index&&profileMap.get(a.person).person.department===dept).map(a=>a.person)]))}));
  const workloads=all.filter(p=>p.campus===campus).map(p=>{const assigned=assignments.filter(a=>a.person===p.person.id).map(a=>a.slot),excluded=eligibility(p,campus),min=excluded?0:(campus==='学院路'&&p.grade.key==='g3'?1:2),max=excluded?0:2;return {id:p.person.id,name:p.person.name,department:p.person.department,grade:p.grade.label,gradeBasis:p.grade.basis,assigned,min,max,excluded,availableCount:matrix[p.person.id]?.filter(x=>x.available).length||0,preferencePenalty:pairPenalty(assigned)}});
  const gaps=grid.flatMap(s=>DEPTS.filter(d=>!s.departments[d].length).map(department=>({slot:s.index,department}))),both=grid.filter(s=>DEPTS.every(d=>s.departments[d].length)).length,total3=grid.filter(s=>DEPTS.reduce((n,d)=>n+s.departments[d].length,0)===3).length,idealShahe=grid.filter(s=>DEPTS.every(d=>s.departments[d].length===1)).length,extras=Object.fromEntries(DEPTS.map(d=>[d,grid.filter(s=>s.departments[d].length===2).length]));
  const shortage=workloads.filter(p=>!p.excluded&&p.assigned.length<p.min),preferences=workloads.filter(p=>p.preferencePenalty),counts=Object.fromEntries(DEPTS.map(d=>{const ps=included.filter(p=>p.person.department===d);return [d,{people:ps.length,capacity:ps.length*2,requiredForCoverage:20,arithmeticShortfall:Math.max(0,20-ps.length*2),candidates:ps.filter(p=>matrix[p.person.id].some(x=>x.available)).length}]}));
  const audit=verify(data,{campus,start,end,assignments},options.overrides||{},rules);const pending=!!data.meta.pendingTimetableRefresh,complete=both===20&&shortage.length===0&&audit.valid,formal=complete&&!pending&&ms(end)>=ms(endDates(data).duty);
  const configs={volunteerDouble:grid.filter(s=>s.departments['志工部'].length===2&&s.departments['实践部'].length===1).length,practiceDouble:grid.filter(s=>s.departments['志工部'].length===1&&s.departments['实践部'].length===2).length,coveredTimes:grid.filter(s=>DEPTS.some(d=>s.departments[d].length)).length};
  return {campus,start,end,slots,profiles:all,included:included.map(p=>p.person.id),matrix,grid,assignments,workloads,counts,gaps,both,total3,idealShahe,extras,configs,shortage,preferences,audit,complete,formal,pending,unknownCampus:all.filter(p=>p.campus==='待确认').map(p=>p.person.id),sourceRevision:data.meta.dataRevision||data.meta.updated};
 }
 function verify(data,plan,overrides={},rules={}){const ps=profiles(data,overrides),map=new Map(ps.map(p=>[p.person.id,p])),slots=slotsFor(plan.start,plan.end),errors=[],loads={},cells={},seen=new Set();for(const a of plan.assignments){const p=map.get(a.person),slot=slots[a.slot];if(!p||!slot){errors.push('人员或时段不存在');continue}const key=a.person+':'+a.slot;if(seen.has(key))errors.push(p.person.name+' 同一班次重复');seen.add(key);const reason=eligibility(p,plan.campus);if(reason)errors.push(p.person.name+'：'+reason);loads[a.person]=(loads[a.person]||0)+1;if(loads[a.person]>2)errors.push(p.person.name+' 超过2班');if(plan.assignments.filter(x=>x.person===a.person&&x.slot%4===0).length>1)errors.push(p.person.name+' 出现两个早班，方案作废');const ck=a.slot+':'+p.person.department;cells[ck]=(cells[ck]||0)+1;if(cells[ck]>2)errors.push('同部门同一时段超过2人');const r=availability(data,p,slot,rules,data.events.filter(e=>e.person===a.person));if(!r.available)errors.push(p.person.name+' '+slot.label+'：'+r.reason)}if(plan.campus==='学院路')for(const s of slots)if((cells[s.index+':志工部']||0)+(cells[s.index+':实践部']||0)>3)errors.push('学院路同一时段超过3人');return {valid:!errors.length,errors:[...new Set(errors)]}}
 function generateBest(data,options={},rules={}){let best=null,score=Infinity;for(let k=0;k<4;k++){const plan=generate(data,{...options,seed:(options.seed||0)+k},rules);const n=plan.gaps.length*1e9+plan.shortage.reduce((s,w)=>s+(w.min-w.assigned.length)*(['大一','大二'].includes(w.grade)?1e7:1e6),0)+plan.preferences.reduce((s,w)=>s+w.preferencePenalty,0)*100+Math.abs(plan.configs.volunteerDouble-plan.configs.practiceDouble)*10-plan.total3;if(n<score){score=n;best=plan;best.seed=(options.seed||0)+k}}return best}
 const api={BLOCKS,DEPTS,gradeOf,profiles,endDates,slotsFor,eligibility,availability,generate,generateBest,verify,pairPenalty};root.DutyScheduler=api;if(typeof module!=='undefined'&&module.exports)module.exports.DutyScheduler=api;
})(typeof window!=='undefined'?window:globalThis);

(function(root){
 'use strict';
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const xml=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
 const collator=new Intl.Collator('zh-Hans-CN-u-co-pinyin',{sensitivity:'base'});
 const rank=p=>p.role==='部长'?0:p.role==='副部长'?1:2;
 const isNew=p=>!!p.joinedSemester||/2026年秋季学期新加入/.test(p.rosterNotes||'');
 function compare(a,b){const pa=a.person,pb=b.person,role=rank(pa)-rank(pb);if(role)return role;if(rank(pa)===2&&isNew(pa)!==isNew(pb))return Number(isNew(pa))-Number(isNew(pb));const grades={grad:9,g4:4,g3:3,g2:2,g1:1,unknown:0};return (grades[b.grade.key]-grades[a.grade.key])||collator.compare(pa.name,pb.name)||pa.id.localeCompare(pb.id)}
 function makeModel(data,plans,contact=p=>p.phone){
  const D=root.DutyScheduler;if(!D)throw Error('排班模块未加载');
  if(plans.length!==2||!['学院路','沙河'].every(c=>plans.some(p=>p.campus===c)))throw Error('导出需同时包含学院路、沙河');
  if(plans.some(p=>!p.audit.valid))throw Error('排班校验失败，不能导出');
  if(plans.some(p=>p.start!==plans[0].start||p.end!==plans[0].end||p.sourceRevision!==plans[0].sourceRevision))throw Error('两校区的有效期或资料版本不一致');
  for(const plan of plans)for(const w of plan.workloads)if(w.assigned.filter(i=>i%4===0).length>1)throw Error(w.name+'出现两个早班，方案作废');
  const people=new Map(data.people.map(p=>[p.id,p])),profiles=plans[0].profiles;
  return D.DEPTS.map(department=>{
   const cells=[];for(let block=0;block<4;block++){const row=[];for(let day=1;day<=5;day++){const index=(day-1)*4+block,entries=[];for(const campus of ['学院路','沙河']){const p=plans.find(p=>p.campus===campus),ids=p.grid[index].departments[department];if(ids.length)entries.push(...ids.map(id=>people.get(id).name+(campus==='沙河'?'（线上）':'')));else entries.push(campus==='沙河'?'线上待补':'学院路待补')}row.push(entries.join('\n'))}cells.push(row)}
   const contacts=profiles.filter(q=>q.person.department===department).sort(compare).map(q=>({id:q.person.id,name:q.person.name,displayName:q.person.name+(q.campus==='沙河'?'（线上）':''),phone:contact(q.person)||'未填写',role:q.person.role,group:rank(q.person)===0?'部长':rank(q.person)===1?'副部长':isNew(q.person)?'学生干部 · 2026年秋季学期新加入':'学生干部 · 原有人员',grade:q.grade.key,newJoiner:isNew(q.person)}));
   const gaps=plans.map(p=>{const n=p.gaps.filter(g=>g.department===department).length;return p.campus+(p.campus==='沙河'?'线上':'线下')+'：'+(n?'缺 '+n+' 个时段':'20 个时段已覆盖')}).join('；');
   return {department,title:'2026年秋季学期 共青团北京航空航天大学委员会\n'+(department==='志工部'?'志愿者工作部':'社会实践部')+'学生干部值班表',start:plans[0].start,end:plans[0].end,cells,contacts,gaps,sourceDate:data.meta.timetableUpdated||data.meta.updated,hasGaps:plans.some(p=>p.gaps.some(g=>g.department===department)),preferences:plans.flatMap(p=>p.preferences.filter(w=>w.department===department).map(w=>w.name+'需同日值班'))};
  });
 }
 function worksheet(model){
  const rows=[],merges=[];let index=1;
  const cell=(col,row,value,style)=>`<c r="${col}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const add=(values,height,style,merge=false)=>{const row=index++;rows.push(`<row r="${row}" ht="${height}" customHeight="1">${values.map((v,i)=>cell(String.fromCharCode(65+i),row,v,style)).join('')}</row>`);if(merge)merges.push(`A${row}:F${row}`)};
  add([model.title],52,1,true);add(['','星期一','星期二','星期三','星期四','星期五'],30,2);
  const D=root.DutyScheduler;for(let block=0;block<4;block++){const b=D.BLOCKS[block],names=model.cells[block];add(['第'+b.label+'\n（'+b.start+'–'+b.end+'）',...names],Math.max(62,Math.max(...names.map(x=>x.split('\n').length))*17+12),3)}
  add(['生效期：'+model.start+' 至 '+model.end+'（第17周结束）；第18–19周不值班。'],25,4,true);
  add(['“（线上）”为沙河线上值班，其余为学院路线下；同格按各自方式参与。'],25,4,true);
  add([(model.hasGaps?'缺口待补：':'覆盖核验：')+model.gaps+(model.preferences.length?'；'+model.preferences.join('、'):'')],27,model.hasGaps?6:4,true);
  add(['本部门现任人员联系方式（部长 → 副部长 → 原有学生干部 → 新加入学生干部）'],24,5,true);
  let phoneLine=[];const units=text=>Array.from(text).reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);for(const p of model.contacts){const entry=p.displayName+'：'+p.phone;if(phoneLine.length&&(phoneLine.length>=5||units([...phoneLine,entry].join('     '))>130)){add([phoneLine.join('     ')],26,4,true);phoneLine=[]}phoneLine.push(entry)}if(phoneLine.length)add([phoneLine.join('     ')],26,4,true);
  add(['排序：部长、副部长、原有学生干部、新加入学生干部；各组按高年级在前，同年级按姓名拼音。'],24,7,true);
  add(['按 '+model.sourceDate+' 课表和已登记安排逐次核验；每人最多2班、最多1次早班。'+(model.hasGaps?'本表仍有待补时段。':'')],24,7,true);
  const last=index-1;return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:F${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="6" width="24" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.2" right="0.2" top="0.25" bottom="0.25" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/><headerFooter><oddFooter>&amp;C第 &amp;P 页</oddFooter></headerFooter></worksheet>`;
 }
 const styles=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}"><fonts count="5"><font><sz val="12"/><name val="宋体"/></font><font><b/><sz val="18"/><name val="小标宋"/></font><font><sz val="14"/><name val="仿宋"/></font><font><sz val="11"/><name val="宋体"/></font><font><b/><sz val="11"/><name val="宋体"/><color rgb="FF9A4D10"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF334155"/></left><right style="thin"><color rgb="FF334155"/></right><top style="thin"><color rgb="FF334155"/></top><bottom style="thin"><color rgb="FF334155"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8">${[[0,0,0,'center'],[1,0,1,'center'],[0,2,1,'center'],[2,0,1,'center'],[3,0,0,'left'],[0,2,0,'left'],[4,3,0,'left'],[3,0,0,'left']].map(([font,fill,border,alignment])=>`<xf numFmtId="49" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0};
 function zip(files){const enc=new TextEncoder(),parts=[],central=[];let offset=0;const u16=(v,o,n)=>v.setUint16(o,n,true),u32=(v,o,n)=>v.setUint32(o,n,true),date=((2026-1980)<<9)|(10<<5)|17;for(const [file,text] of Object.entries(files)){const name=enc.encode(file),bytes=enc.encode(text),checksum=crc(bytes),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,12,date);u32(v,14,checksum);u32(v,18,bytes.length);u32(v,22,bytes.length);u16(v,26,name.length);local.set(name,30);parts.push(local,bytes);const item=new Uint8Array(46+name.length),c=new DataView(item.buffer);u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u16(c,8,0x800);u16(c,14,date);u32(c,16,checksum);u32(c,20,bytes.length);u32(c,24,bytes.length);u16(c,28,name.length);u32(c,42,offset);item.set(name,46);central.push(item);offset+=local.length+bytes.length}const length=central.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,8,central.length);u16(e,10,central.length);u32(e,12,length);u32(e,16,offset);const all=[...parts,...central,end],out=new Uint8Array(all.reduce((s,a)=>s+a.length,0));let n=0;for(const p of all){out.set(p,n);n+=p.length}return out}
 function build(data,plans,contact){const models=makeModel(data,plans,contact),files={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+models.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${models.map((m,i)=>`<sheet name="${m.department}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${models.map((m,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${m.department}'!$A$1:$F$${worksheet(m).match(/dimension ref="A1:F(\d+)"/)[1]}</definedName>`).join('')}</definedNames></workbook>`,
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+models.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':styles};models.forEach((m,i)=>files['xl/worksheets/sheet'+(i+1)+'.xml']=worksheet(m));return {bytes:zip(files),models}}
 const api={build,makeModel,compare};root.DutyWorkbook=api;if(typeof module!=='undefined'&&module.exports)module.exports.DutyWorkbook=api;
})(typeof window!=='undefined'?window:globalThis);
