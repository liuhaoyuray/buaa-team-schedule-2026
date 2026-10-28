function renderResults(){renderResultsOriginal();if(window.WorkspaceApp)window.WorkspaceApp.refreshQuery();}
function runQuery(){runQueryOriginal();if(window.WorkspaceApp)window.WorkspaceApp.refreshQuery();}
function persistSelection(){persistSelectionOriginal();if(window.WorkspaceApp)window.WorkspaceApp.refreshCounts();}
(() => {
 'use strict';
 const routes=[['home','部门工作台','⌂','常用功能与协作概览'],['office','报销材料','▤','根据发票生成报销材料'],['hours','志愿时长','◷','匹配人员名单并生成导入文件'],['query','时段查询','◷','按时间查询空闲人员'],['colleges','学院系号','⌕','按名称或系号查询学院'],['duty','值班表','▦','查看已确定的每周值班安排'],['week','一周总览','▦','按节次查看空闲分布'],['planner','共同排期','⇄','寻找多人共同空闲'],['person','个人课表','▤','查看个人课程安排'],['directory','人员名录','♧','查看人员与联系方式'],['lottery','幸运抽奖','✦','选择名单并抽取'],['settings','数据与校历','⚙','数据来源与日期设置']];
 const active=DATA.people.filter(p=>p.rosterStatus!=='not_in_roster'),byId=new Map(active.map(p=>[p.id,p]));
 const fields=['date','start','end','department','campus','college','role','search'];
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
 const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{toast('当前浏览器无法保存，请及时导出需要的资料。');return false}};
 let saved=read('buaa-workspace-queries-v3',[]);if(!Array.isArray(saved))saved=[];
 saved=saved.filter(q=>q&&typeof q.id==='string'&&q.fields&&typeof q.fields.date==='string'&&typeof q.label==='string').slice(0,8);
 let prefs=read('buaa-workspace-query-prefs-v3',{});if(!prefs||typeof prefs!=='object')prefs={};
 let sort=['department','name','campus'].includes(prefs.sort)?prefs.sort:'department',compact=prefs.compact===true,pageNumber=1,lastSignature='',visibleCards=[],hits=[],hitIndex=0;
 const pageSize=12;
 const labelOf=v=>routes.find(r=>r[0]===v)?.[1]||'部门工作台';
 function route(view){if(!routes.some(r=>r[0]===view))return;for(const id of ['wsSearchDialog','wsMoreDialog'])if($(id).open)$(id).close();setView(view);if(view==='planner'&&selectedIds.size&&!plannerIds.size)importSelectionToPlanner();}
 function onView(view){
  document.body.dataset.workspaceView=view;$('wsBreadcrumb').textContent=labelOf(view);
  document.querySelectorAll('.ws-mobile-nav [data-ws-route]').forEach(b=>{const current=b.dataset.wsRoute===view;b.classList.toggle('active',current);b.setAttribute('aria-current',current?'page':'false');});
  $('wsMoreButton').classList.toggle('active',!['home','office','hours','query'].includes(view));
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view?'page':'false'));
  if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);
  if(view==='home')refreshHome();if(view==='query')refreshQuery();
  window.scrollTo({top:0,behavior:'instant'});
 }
 function refreshCounts(){
  $('wsHomeSelectionCount').textContent=selectedIds.size;
 }
 function refreshHome(){
  const date=today(),info=E.dayInfo(date,DATA,storeState.rules);
  $('wsGreeting').textContent=date.replaceAll('-','.')+' / '+(info.valid?'第 '+info.week+' 教学周':'学期范围外');
  refreshCounts();renderSaved();refreshAvailability();
 }
 function refreshAvailability(){
  const date=$('wsQuickDate').value,[start,end]=$('wsQuickTime').value.split(',');
  if(!date){$('wsAvailabilityResult').innerHTML='<p class="ws-empty">先选一个日期。</p>';return;}
  const rows=E.query(DATA,date,start,end,{},storeState.rules),free=rows.filter(r=>r.status==='free'),unknown=rows.filter(r=>r.status==='unknown');
  $('wsAvailabilityResult').innerHTML='<div class="ws-availability-total"><strong>'+free.length+'<small>人空闲</small></strong><span>'+unknown.length+' 人安排信息不完整</span></div><div class="ws-dept-bars">'+['志工部','实践部'].map(dept=>{const total=rows.filter(r=>r.person.department===dept).length,n=free.filter(r=>r.person.department===dept).length;return '<div><p><span>'+dept+'</span><strong>'+n+' / '+total+'</strong></p><div class="ws-bar"><i style="width:'+Math.round(n/Math.max(total,1)*100)+'%"></i></div></div>';}).join('')+'</div>';
 }
 const queryData=()=>({fields:Object.fromEntries(fields.map(id=>[id,$(id).value])),status:state.status});
 function renderSaved(){
  const chips=saved.map(q=>'<span class="ws-saved-chip"><button data-ws-saved="'+escapeHTML(q.id)+'">'+escapeHTML(q.label)+'</button><button data-ws-remove="'+escapeHTML(q.id)+'" aria-label="删除收藏 '+escapeHTML(q.label)+'">×</button></span>').join('');
  $('wsQuerySaved').innerHTML=chips||'<span class="ws-subtle">把常用时间和筛选条件收藏在这里</span>';
  $('wsHomeSaved').innerHTML=chips||'<div class="ws-saved-empty"><span>☆</span><div><strong>让常用的查询，一点就到。</strong><p>在时段查询里设置好条件，点击“收藏查询”。</p></div><button data-ws-route="query">创建第一个收藏 ↗</button></div>';
 }
 function applySaved(id){const q=saved.find(x=>x.id===id);if(!q)return;for(const id of fields){const value=String(q.fields[id]??'').slice(0,200);if($(id).tagName==='SELECT')$(id).value=[...$(id).options].some(o=>o.value===value)?value:'';else $(id).value=value;}state.status=Object.hasOwn(LABELS,q.status)||q.status==='all'?q.status:'free';runQuery();route('query');}
 function refreshQuery(){
  const signature=JSON.stringify(queryData());if(signature!==lastSignature){pageNumber=1;lastSignature=signature;}
  const cards=[...$('results').querySelectorAll(':scope > .person')];
  const personOf=node=>byId.get(node.querySelector('[data-person]')?.dataset.person);
  const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'zh');
  cards.sort((a,b)=>{const x=personOf(a),y=personOf(b);if(!x||!y)return 0;return (sort==='department'?compare(x.department,y.department):sort==='campus'?compare(x.campus,y.campus):0)||compare(x.name,y.name);});
  cards.forEach(n=>$('results').append(n));
  const pages=Math.max(1,Math.ceil(cards.length/pageSize));pageNumber=Math.min(Math.max(1,pageNumber),pages);
  cards.forEach((n,i)=>n.hidden=i<(pageNumber-1)*pageSize||i>=pageNumber*pageSize);visibleCards=cards.filter(n=>!n.hidden);
  $('results').classList.toggle('ws-compact',compact);$('wsResultSort').value=sort;$('wsDensity').setAttribute('aria-pressed',String(compact));$('wsDensity').textContent=compact?'舒展显示':'紧凑显示';
  $('wsResultCount').textContent=cards.length?'共 '+cards.length+' 人 · 显示 '+((pageNumber-1)*pageSize+1)+'–'+Math.min(pageNumber*pageSize,cards.length):'当前条件下暂无人员';
  $('wsSelectPage').disabled=!visibleCards.some(n=>state.results.some(r=>r.person.id===personOf(n)?.id&&r.status==='free'));
  const valid=$('date').value&&$('start').value&&$('end').value&&E.min($('end').value)>E.min($('start').value);
  $('wsSaveQuery').disabled=$('wsShareQuery').disabled=!valid;
  $('wsPagination').innerHTML=cards.length>pageSize?'<span>每页 '+pageSize+' 人</span><div><button data-ws-page="'+(pageNumber-1)+'" '+(pageNumber===1?'disabled':'')+' aria-label="上一页">←</button>'+Array.from({length:pages},(_,i)=>'<button data-ws-page="'+(i+1)+'" class="'+(pageNumber===i+1?'active':'')+'" aria-current="'+(pageNumber===i+1?'page':'false')+'">'+(i+1)+'</button>').join('')+'<button data-ws-page="'+(pageNumber+1)+'" '+(pageNumber===pages?'disabled':'')+' aria-label="下一页">→</button></div>':'';
 }
 function renderSearch(){
  const q=$('wsGlobalSearch').value.trim().toLocaleLowerCase();
  hits=[...routes.filter(r=>(r[1]+' '+r[3]).toLocaleLowerCase().includes(q)).map(r=>({type:'route',id:r[0],title:r[1],sub:r[3],icon:r[2]})),...active.filter(p=>q&&[p.name,p.college,p.studentId,getContact(p)].some(v=>String(v||'').toLocaleLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name,'zh')).map(p=>({type:'person',id:p.id,title:p.name,sub:p.department+' · '+p.campus+' · '+(p.college||''),icon:p.name.slice(-1)}))].slice(0,12);
  hitIndex=Math.min(Math.max(0,hitIndex),Math.max(0,hits.length-1));
  $('wsSearchResults').innerHTML=hits.map((h,i)=>'<button id="wsSearchOption'+i+'" data-ws-hit="'+i+'" role="option" aria-selected="'+(i===hitIndex)+'"><span class="ws-search-icon">'+escapeHTML(h.icon)+'</span><span><strong>'+escapeHTML(h.title)+'</strong><small>'+escapeHTML(h.sub)+'</small></span><b>'+(h.type==='person'?'课表 ↗':'↗')+'</b></button>').join('')||'<div class="ws-empty">没有找到结果，试试姓名、学号或功能名。</div>';
  if(hits.length)$('wsGlobalSearch').setAttribute('aria-activedescendant','wsSearchOption'+hitIndex);else $('wsGlobalSearch').removeAttribute('aria-activedescendant');
 }
 function openSearch(){if($('wsMoreDialog').open)$('wsMoreDialog').close();$('wsGlobalSearch').value='';hitIndex=0;renderSearch();if(!$('wsSearchDialog').open)$('wsSearchDialog').showModal();$('wsGlobalSearch').focus();}
 function chooseHit(index){const h=hits[index];if(!h)return;if(h.type==='person'){state.selectedPerson=h.id;$('personSelect').value=h.id;$('personWeek').value=state.week;route('person');}else route(h.id);}
 document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.wsRoute)route(b.dataset.wsRoute);
  else if(b.dataset.wsClose)$(b.dataset.wsClose).close();
  else if(b.dataset.wsSaved)applySaved(b.dataset.wsSaved);
  else if(b.dataset.wsRemove){saved=saved.filter(q=>q.id!==b.dataset.wsRemove);save('buaa-workspace-queries-v3',saved);renderSaved();}
  else if(b.dataset.wsPage){pageNumber=Number(b.dataset.wsPage);refreshQuery();$('wsQueryTools').scrollIntoView({block:'start'});}
  else if(b.dataset.wsHit!==undefined)chooseHit(Number(b.dataset.wsHit));
 });
 $('wsSearchLaunch').onclick=openSearch;$('wsMoreSearch').onclick=openSearch;$('wsMoreButton').onclick=()=>$('wsMoreDialog').showModal();if($('officeMore'))$('officeMore').onclick=()=>$('wsMoreDialog').showModal();
 $('wsMoreRoutes').innerHTML=routes.map(r=>'<button data-ws-route="'+r[0]+'"><span>'+r[2]+'</span><strong>'+r[1]+'</strong><small>'+r[3]+'</small></button>').join('');
 $('wsGlobalSearch').oninput=()=>{hitIndex=0;renderSearch();};
 $('wsGlobalSearch').onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();hitIndex=(hitIndex+(e.key==='ArrowDown'?1:-1)+Math.max(hits.length,1))%Math.max(hits.length,1);renderSearch();$('wsSearchOption'+hitIndex)?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();chooseHit(hitIndex);}};
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}else if(e.key==='/'&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();openSearch();}});
 window.addEventListener('message',e=>{if(e.source===$('lotteryFrame').contentWindow&&(location.protocol==='file:'||e.origin===location.origin)&&e.data?.type==='buaa-workspace-search')openSearch();});
 $('wsQuickDate').value=today();$('wsQuickDate').onchange=refreshAvailability;$('wsQuickTime').onchange=refreshAvailability;
 $('wsOpenQuick').onclick=()=>{const [start,end]=$('wsQuickTime').value.split(',');openTime($('wsQuickDate').value,start,end);};
 $('wsHomeSelection').onclick=()=>$('selectionDialog').showModal();
 $('wsResultSort').onchange=()=>{sort=$('wsResultSort').value;save('buaa-workspace-query-prefs-v3',{sort,compact});refreshQuery();};
 $('wsDensity').onclick=()=>{compact=!compact;save('buaa-workspace-query-prefs-v3',{sort,compact});refreshQuery();};
 $('wsSelectPage').onclick=()=>{let added=0;for(const card of visibleCards){const id=card.querySelector('[data-person]').dataset.person;if(state.results.some(r=>r.person.id===id&&r.status==='free')&&!selectedIds.has(id)){selectedIds.add(id);added++;}}persistSelection();toast(added?'已加入 '+added+' 位空闲同学':'本页空闲同学已在名单中');};
 $('wsSaveQuery').onclick=()=>{const q=queryData();if(saved.some(x=>JSON.stringify({fields:x.fields,status:x.status})===JSON.stringify(q))){toast('这个查询已经收藏');return;}if(saved.length>=8){toast('最多保存8个查询，请先移除不再使用的收藏。');return;}const label=q.fields.date.slice(5)+' '+q.fields.start+'–'+q.fields.end+' · '+(q.fields.department||'两部门');saved.unshift({id:Date.now().toString(36),label,...q});save('buaa-workspace-queries-v3',saved);renderSaved();toast('查询已收藏');};
 $('wsShareQuery').onclick=async()=>{const url=new URL(location.href);url.search='';for(const field of fields.filter(f=>f!=='search'))if($(field).value)url.searchParams.set(field,$(field).value);url.searchParams.set('status',state.status);url.hash='query';try{await navigator.clipboard.writeText(url.href);toast('查询链接已复制，链接不包含搜索词或联系方式。');}catch{download('查询链接.txt',url.href);toast('查询链接已保存为文本。');}};
 $('exportQuery').textContent='导出筛选结果';$('exportQuery').title='导出当前状态下的全部人员，包含所有分页';
 $('exportQuery').onclick=()=>{
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const rows=[['查询日期','开始','结束','教学周','姓名','部门','学号','学院（书院）','职务','校区','状态','课程或已有安排','说明','联系方式'],...state.results.filter(r=>state.status==='all'||r.status===state.status).map(r=>[$('date').value,$('start').value,$('end').value,E.dayInfo($('date').value,DATA,storeState.rules).week,r.person.name,r.person.department,r.person.studentId||'',r.person.college||'',r.person.role||'',r.person.campus,LABELS[r.status],eventsForDisplay(r.events).map(e=>e.title+' '+e.start+'-'+e.end+' '+e.room).join('；'),r.reasons.join('；'),getContact(r.person)])];
  download('时段查询_'+$('date').value+'_'+(LABELS[state.status]||'全部')+'.csv','\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 };
 $('copyFree').textContent='复制全部空闲';
 window.WorkspaceApp={onView,refreshQuery,refreshCounts,refreshHome,route,openSearch};
 renderSaved();refreshQuery();refreshHome();
 let initial=location.hash.slice(1);if(!routes.some(r=>r[0]===initial))initial='home';
 if(initial==='query'){const params=new URLSearchParams(location.search);for(const field of fields.filter(f=>f!=='search')){const value=params.get(field);if(!value||value.length>200)continue;const input=$(field);if(input.tagName==='SELECT'){if([...input.options].some(o=>o.value===value))input.value=value;}else if((field==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value))||(['start','end'].includes(field)&&/^\d{2}:\d{2}$/.test(value)))input.value=value;}if(Object.hasOwn(LABELS,params.get('status'))||params.get('status')==='all')state.status=params.get('status');runQuery();}
 route(initial);
 window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(routes.some(r=>r[0]===target)&&state.view!==target)route(target);});
})();
