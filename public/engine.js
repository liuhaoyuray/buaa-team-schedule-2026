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
  function evaluate(person,date,start,end,data,rules={}){
    const info=dayInfo(date,data,rules); const own=data.events.filter(e=>e.person===person.id);
    if(person.hasTimetable===false)return {status:'unknown',events:[],reasons:['尚未收集课表，请直接联系本人确认时间']};
    if(!info.valid||info.courseWeek>data.meta.teachingWeeks)return {status:'unknown',events:[],reasons:['未收集该日期的课程／考试安排']};
    let active=own.filter(e=>intersects(e,start,end)&&!(info.stop&&e.kind==='course')&&(e.date?e.date===date:(e.day===(e.kind==='course'?info.courseDay:info.day)&&(!e.weeks||e.weeks.includes(e.kind==='course'?info.courseWeek:info.week))&&!(e.excludeWeeks||[]).includes(e.kind==='course'?info.courseWeek:info.week))));
    const known=active.filter(e=>!e.uncertain),unknown=active.filter(e=>e.uncertain),reasons=[];
    if(person.alwaysConfirm)reasons.push(person.alwaysConfirm);
    if(person.emptyWeekConfirm&&!own.some(e=>e.kind==='course'&&e.weeks?.includes(info.courseWeek)))reasons.push(person.emptyWeekConfirm);
    if(!info.special && ((date>='2026-09-25'&&date<='2026-09-27')||(date>='2026-10-01'&&date<='2026-10-07')))reasons.push('节假日教学安排未确认，可在校历设置中指定停课或补课');
    if(unknown.length)reasons.push(...unknown.map(e=>e.note||'原表未注明具体周次／时间'));
    let status=known.some(e=>e.kind==='course')?'course':known.length?'other':(reasons.length||unknown.length)?'unknown':'free';
    return {status,events:active,reasons:[...new Set(reasons)]};
  }
  function query(data,date,start,end,filters={},rules={}){
    return data.people.filter(p=>(filters.includeUnconfirmed||p.rosterStatus!=='not_in_roster')&&(!filters.department||p.department===filters.department)&&(!filters.campus||p.campus===filters.campus)&&(!filters.college||p.college===filters.college)&&(!filters.role||p.role===filters.role)&&(!filters.search||[p.name,p.department,p.campus,p.studentId,p.college,p.role,p.phone].some(v=>String(v||'').includes(filters.search)))).map(p=>({person:p,...evaluate(p,date,start,end,data,rules)}));
  }
  const api={dateISO,dayInfo,min,intersects,evaluate,query,DAY};root.ScheduleEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
