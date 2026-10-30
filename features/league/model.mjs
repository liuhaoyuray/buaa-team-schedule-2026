const additive=['students','members','branches','branchesGeneral','newMembers','cadres'];
export const defaultAliases={'杭州国际创新研究院':'杭州北航国际创新研究院'};
export function canonical(name,aliases=defaultAliases){return aliases[name]||name}
const finiteSum=(a,b)=>a==null||b==null?null:a+b;
const empty=()=>Object.fromEntries(additive.map(k=>[k,0]));
function selectedRows(data,{kind='',level='college',excludeFresh=false,search='',aliases=defaultAliases}={}){
 const q=search.trim(),wanted=kind==='本科生'||kind==='研究生'?kind:null;
 const matchingNames=q?new Set(data.records.filter(r=>[r.college,r.code,canonical(r.college,aliases)].some(v=>String(v||'').includes(q))).map(r=>canonical(r.college,aliases))):null;
 return data.records.filter(r=>(!wanted||r.kind===wanted)&&(!matchingNames||matchingNames.has(canonical(r.college,aliases)))&&(r.kind==='本科生'||(level==='college'?r.level==='合计':r.level!=='合计'))&&(level==='college'||level==='detail'||r.level===level)&&(!excludeFresh||r.kind!=='本科生'||r.level!=='2026级'||level==='college')).map(r=>{
  if(!excludeFresh)return {...r};
  if(r.kind==='本科生')return {...r,...(r.level==='2026级'?empty():{}),youthRatioOriginal:null,studentRatioOriginal:null,youthOriginal:null};
  return {...r,students:r.otherStudents,members:r.otherMembers,branches:null,branchesGeneral:null,newMembers:null,cadres:null,youthRatioOriginal:null,studentRatioOriginal:null,youthOriginal:null,freshStudents:0,freshMembers:0};
 });
}
export function rowsFor(data,options={}){
 const {kind='',level='college',excludeFresh=false,aliases=defaultAliases}=options,rows=selectedRows(data,options);
 if(level!=='college')return rows;
 const byCategory=new Map();
 for(const r of rows){const key=r.kind+'|'+canonical(r.college,aliases);if(!byCategory.has(key))byCategory.set(key,{kind:r.kind,college:canonical(r.college,aliases),originalNames:[],codes:[],level:'合计',sourceRows:[],remark:'',youthRatioOriginal:excludeFresh?null:r.youthRatioOriginal,studentRatioOriginal:excludeFresh?null:r.studentRatioOriginal,youthOriginal:excludeFresh?null:(r.youthOriginal??null),freshStudents:r.freshStudents??null,otherStudents:r.otherStudents??null,freshMembers:r.freshMembers??null,otherMembers:r.otherMembers??null,...empty()});const g=byCategory.get(key);if(!g.originalNames.includes(r.college))g.originalNames.push(r.college);if(!g.codes.includes(r.code))g.codes.push(r.code);g.sourceRows.push(r.row);if(r.remark&&!g.remark.includes(r.remark))g.remark+=(g.remark?'；':'')+r.remark;for(const f of additive)g[f]=finiteSum(g[f],r[f]);}
 const grouped=[...byCategory.values()].map(g=>({...g,code:g.codes.join(' / ')}));
 if(kind!=='combined')return grouped;
 const map=new Map();for(const r of grouped){if(!map.has(r.college))map.set(r.college,{kind:'本研合计',college:r.college,level:'合计',parts:{},sourceRows:[],remark:'',codes:[],...empty()});const g=map.get(r.college);g.parts[r.kind]=r;g.sourceRows.push(r.kind+'明细表 '+r.sourceRows.join('、')+' 行');if(r.remark&&!g.remark.includes(r.remark))g.remark+=(g.remark?'；':'')+r.remark;for(const code of r.codes)if(!g.codes.includes(code))g.codes.push(code);for(const f of additive)g[f]=finiteSum(g[f],r[f]);}
 return [...map.values()].map(g=>{const u=g.parts['本科生'],p=g.parts['研究生'];return {...g,code:g.codes.join(' / '),undergradStudents:u?.students??null,gradStudents:p?.students??null,undergradMembers:u?.members??null,gradMembers:p?.members??null,originalNames:[...new Set([...(u?.originalNames||[]),...(p?.originalNames||[])])],youthRatioOriginal:null,studentRatioOriginal:null,youthOriginal:null,freshStudents:p?.freshStudents??null,otherStudents:p?.otherStudents??null,freshMembers:p?.freshMembers??null,otherMembers:p?.otherMembers??null,missingKinds:[!u?'本科生':'',!p?'研究生':''].filter(Boolean)}});
}
