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
 function endDates(data){const base=ms(data.meta.week1);return {teaching:iso(base+data.meta.teachingWeeks*7*E.DAY-E.DAY),semester:iso(base+data.meta.maxWeek*7*E.DAY-E.DAY)}}
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
  let changed=true,pass=0;while(changed&&pass++<30){changed=false;for(let i=0;i<assignments.length;i++)for(let j=i+1;j<assignments.length;j++){const a=assignments[i],b=assignments[j];if(a.person===b.person||profileMap.get(a.person).person.department!==profileMap.get(b.person).person.department)continue;if(!matrix[a.person][b.slot].available||!matrix[b.person][a.slot].available)continue;const ownA=assignments.filter(x=>x.person===a.person),ownB=assignments.filter(x=>x.person===b.person);if(ownA.some(x=>x!==a&&x.slot===b.slot)||ownB.some(x=>x!==b&&x.slot===a.slot))continue;const before=pairPenalty(ownA.map(x=>x.slot))+pairPenalty(ownB.map(x=>x.slot)),after=pairPenalty(ownA.map(x=>x===a?b.slot:x.slot))+pairPenalty(ownB.map(x=>x===b?a.slot:x.slot));if(after<before){[a.slot,b.slot]=[b.slot,a.slot];changed=true}}}return assignments;
 }
 function generate(data,options={},rules={}){
  const campus=options.campus??'学院路',start=options.start??'2026-10-19',end=options.end??endDates(data).semester;if(!['学院路','沙河'].includes(campus))throw Error('请选择学院路或沙河校区');const slots=slotsFor(start,end),all=profiles(data,options.overrides||{}),included=all.filter(p=>!eligibility(p,campus)),profileMap=new Map(all.map(p=>[p.person.id,p])),own=new Map(all.map(p=>[p.person.id,[]]));for(const e of data.events)if(own.has(e.person))own.get(e.person).push(e);
  const matrix={};for(const p of included)matrix[p.person.id]=slots.map(s=>availability(data,p,s,rules,own.get(p.person.id)));
  const flow=new Flow(),source=flow.node(),sink=flow.node(),deptNodes={},slotNodes=slots.map(()=>flow.node()),deptSlots={};for(const dept of DEPTS){deptNodes[dept]=flow.node();for(let k=0;k<40;k++)flow.edge(source,deptNodes[dept],1,k<20?0:(k-19)*3000);deptSlots[dept]=slots.map((s,i)=>{const n=flow.node();flow.edge(n,slotNodes[i],1,-1000000000);flow.edge(n,slotNodes[i],1,0);return n})}
  // First cover every actual time window, then add colleagues. Convex costs
  // avoid leaving an entire window empty merely to create more paired cells.
  for(const n of slotNodes){flow.edge(n,sink,1,-10000000);flow.edge(n,sink,1,campus==='学院路'?-100000:0);flow.edge(n,sink,1,campus==='学院路'?0:1000);if(campus==='沙河')flow.edge(n,sink,1,10000)}
  const picks=[];const rotated=[...included].sort((a,b)=>a.person.id.localeCompare(b.person.id));if(rotated.length){const n=(options.seed||0)%rotated.length;rotated.push(...rotated.splice(0,n))}
  for(const p of rotated){const id=p.person.id,n=flow.node();flow.edge(deptNodes[p.person.department],n,1,-1000000);flow.edge(deptNodes[p.person.department],n,1,campus==='学院路'&&p.grade.key==='g3'?0:-500000);const days=Array.from({length:5},()=>flow.node());for(const dn of days){flow.edge(n,dn,1,0);flow.edge(n,dn,1,5000)}for(const slot of slots)if(matrix[id][slot.index].available){const tie=(slot.index*7+(options.seed||0)*3)%17;const e=flow.edge(days[slot.day-1],deptSlots[p.person.department][slot.index],1,tie,{person:id,slot:slot.index});picks.push(e)}}
  flow.solve(source,sink,campus==='学院路'?60:included.length*2);let assignments=picks.filter(e=>e.initial-e.cap>0).map(e=>({...e.tag}));assignments=improve(assignments,matrix,profileMap);assignments.sort((a,b)=>a.slot-b.slot||a.person.localeCompare(b.person));
  const grid=slots.map(s=>({...s,departments:Object.fromEntries(DEPTS.map(dept=>[dept,assignments.filter(a=>a.slot===s.index&&profileMap.get(a.person).person.department===dept).map(a=>a.person)]))}));
  const workloads=all.filter(p=>p.campus===campus).map(p=>{const assigned=assignments.filter(a=>a.person===p.person.id).map(a=>a.slot),excluded=eligibility(p,campus),min=excluded?0:(campus==='学院路'&&p.grade.key==='g3'?1:2),max=excluded?0:2;return {id:p.person.id,name:p.person.name,department:p.person.department,grade:p.grade.label,gradeBasis:p.grade.basis,assigned,min,max,excluded,availableCount:matrix[p.person.id]?.filter(x=>x.available).length||0,preferencePenalty:pairPenalty(assigned)}});
  const gaps=grid.flatMap(s=>DEPTS.filter(d=>!s.departments[d].length).map(department=>({slot:s.index,department}))),both=grid.filter(s=>DEPTS.every(d=>s.departments[d].length)).length,total3=grid.filter(s=>DEPTS.reduce((n,d)=>n+s.departments[d].length,0)===3).length,idealShahe=grid.filter(s=>DEPTS.every(d=>s.departments[d].length===1)).length,extras=Object.fromEntries(DEPTS.map(d=>[d,grid.filter(s=>s.departments[d].length===2).length]));
  const shortage=workloads.filter(p=>!p.excluded&&p.assigned.length<p.min),preferences=workloads.filter(p=>p.preferencePenalty),counts=Object.fromEntries(DEPTS.map(d=>{const ps=included.filter(p=>p.person.department===d);return [d,{people:ps.length,capacity:ps.length*2,requiredForCoverage:20,arithmeticShortfall:Math.max(0,20-ps.length*2),candidates:ps.filter(p=>matrix[p.person.id].some(x=>x.available)).length}]}));
  const audit=verify(data,{campus,start,end,assignments},options.overrides||{},rules);const pending=!!data.meta.pendingTimetableRefresh,complete=both===20&&shortage.length===0&&audit.valid,formal=complete&&!pending&&ms(end)>=ms(endDates(data).semester);
  const configs={volunteerDouble:grid.filter(s=>s.departments['志工部'].length===2&&s.departments['实践部'].length===1).length,practiceDouble:grid.filter(s=>s.departments['志工部'].length===1&&s.departments['实践部'].length===2).length,coveredTimes:grid.filter(s=>DEPTS.some(d=>s.departments[d].length)).length};
  return {campus,start,end,slots,profiles:all,included:included.map(p=>p.person.id),matrix,grid,assignments,workloads,counts,gaps,both,total3,idealShahe,extras,configs,shortage,preferences,audit,complete,formal,pending,unknownCampus:all.filter(p=>p.campus==='待确认').map(p=>p.person.id),sourceRevision:data.meta.dataRevision||data.meta.updated};
 }
 function verify(data,plan,overrides={},rules={}){const ps=profiles(data,overrides),map=new Map(ps.map(p=>[p.person.id,p])),slots=slotsFor(plan.start,plan.end),errors=[],loads={},cells={},seen=new Set();for(const a of plan.assignments){const p=map.get(a.person),slot=slots[a.slot];if(!p||!slot){errors.push('人员或时段不存在');continue}const key=a.person+':'+a.slot;if(seen.has(key))errors.push(p.person.name+' 同一班次重复');seen.add(key);const reason=eligibility(p,plan.campus);if(reason)errors.push(p.person.name+'：'+reason);loads[a.person]=(loads[a.person]||0)+1;if(loads[a.person]>2)errors.push(p.person.name+' 超过2班');const ck=a.slot+':'+p.person.department;cells[ck]=(cells[ck]||0)+1;if(cells[ck]>2)errors.push('同部门同一时段超过2人');const r=availability(data,p,slot,rules,data.events.filter(e=>e.person===a.person));if(!r.available)errors.push(p.person.name+' '+slot.label+'：'+r.reason)}if(plan.campus==='学院路')for(const s of slots)if((cells[s.index+':志工部']||0)+(cells[s.index+':实践部']||0)>3)errors.push('学院路同一时段超过3人');return {valid:!errors.length,errors:[...new Set(errors)]}}
 const api={BLOCKS,DEPTS,gradeOf,profiles,endDates,slotsFor,eligibility,availability,generate,verify,pairPenalty};root.DutyScheduler=api;if(typeof module!=='undefined'&&module.exports)module.exports.DutyScheduler=api;
})(typeof window!=='undefined'?window:globalThis);
