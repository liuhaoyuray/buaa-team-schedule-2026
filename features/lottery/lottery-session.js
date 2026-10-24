(() => {
 'use strict';
 const key='buaa-lottery-2026-session-v3',canonical=new Map(PEOPLE.map(p=>[p.department+'|'+p.name,p]));
 const hint=document.createElement('p');hint.className='session-note';hint.textContent='本机自动保存 · 刷新可继续 · 空格键开始 / 停止';
 const actions=document.createElement('div');actions.className='session-actions';
 actions.innerHTML='<button type="button" id="undoDraw" class="text-button">↶ 撤销上轮</button><button type="button" id="exportDraw" class="text-button">导出 CSV ↗</button>';
 document.querySelector('.history-panel').append(actions,hint);
 let ready=false;
 function controls(){$('undoDraw').disabled=spinning||!history.length;$('exportDraw').disabled=spinning||!history.length;}
 function persist(){if(!ready)return;try{localStorage.setItem(key,JSON.stringify({version:3,filter:departmentFilter,noRepeat:$('noRepeat').checked,winners:history.map(p=>({name:p.name,department:p.department})),savedAt:new Date().toISOString()}));}catch{hint.textContent='当前浏览器无法自动保存，请及时导出中奖记录。';}}
 const baseHistory=renderHistory,baseCounters=updateCounters,baseStart=startDraw,baseStop=stopDraw;
 renderHistory=function(){baseHistory();controls();persist();};
 updateCounters=function(){baseCounters();controls();persist();};
 startDraw=function(){baseStart();controls();};
 stopDraw=function(){baseStop();controls();persist();};
 function restoreStage(){
  if(!history.length){showInitial();$('drawButtonLabel').textContent='开始抽奖';return;}
  const winner=history[history.length-1];displayPerson(winner);stage.classList.remove('is-spinning');stage.classList.add('is-winner');$('stageTop').textContent='LUCKY DRAW · SAVED';$('stageState').textContent='已恢复本机中奖记录';$('stageBottom').textContent='已完成 '+history.length+' 轮 · 可以继续抽奖';$('drawButtonLabel').textContent='继续抽奖';
 }
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  if(saved?.version===3&&Array.isArray(saved.winners)){
   for(const item of saved.winners.slice(0,2000)){const person=canonical.get(String(item?.department)+'|'+String(item?.name));if(person)history.push(person);}
   if(['全部','志愿者工作部','社会实践部'].includes(saved.filter))departmentFilter=saved.filter;
   $('noRepeat').checked=saved.noRepeat!==false;
   document.querySelectorAll('.filter').forEach(b=>{const active=b.dataset.filter===departmentFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
 }catch{}
 ready=true;restoreStage();renderHistory();updateCounters();
 $('undoDraw').onclick=()=>{if(spinning||!history.length)return;if(!window.confirm('确定撤销上轮中奖记录吗？'))return;history.pop();restoreStage();renderHistory();updateCounters();};
 $('exportDraw').onclick=()=>{
  if(spinning||!history.length)return;
  const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
  const rows=[['轮次','姓名','学院（书院）','部门'],...history.map((p,i)=>[i+1,p.name,p.college,p.department])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='两部门中奖记录_'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date())+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&parent!==window){event.preventDefault();parent.postMessage({type:'buaa-workspace-search'},location.protocol==='file:'?'*':location.origin);return;}
  if(event.code!=='Space'||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target.closest('input,textarea,select,[contenteditable=true]')||$('modalLayer').classList.contains('show'))return;
  const button=event.target.closest('button');if(button&&button!==drawButton)return;
  event.preventDefault();if(!drawButton.disabled)drawButton.click();
 });
})();
