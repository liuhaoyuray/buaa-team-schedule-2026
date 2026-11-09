import fs from 'node:fs/promises';
import path from 'node:path';
import {common, groups, icon, routeLink, routes} from '../features/workspace/navigation.mjs';

function sections(entries) {
 return entries.map(({label, ids})=>
  '<section class="ws-route-group"><h3>'+label+'</h3><div>'+ids.map(id=>routeLink(id,true)).join('')+'</div></section>').join('');
}

function mobileNavigation() {
 const items=[['home','首页'],['query','查空闲'],['hours','录时长'],['office','报销']];
 return items.map(([id,label])=>'<button type="button" data-ws-route="'+id+'">'+icon(id)+'<span>'+label+'</span></button>').join('')+
  '<button type="button" id="wsMoreButton" aria-haspopup="dialog">'+icon('more')+'<span>全部</span></button>';
}

export async function applyWorkspaceUpgrade(root,template,app){
 const dir=path.join(root,'features/workspace');
 const read=name=>fs.readFile(path.join(dir,name),'utf8');
 const [homeSource,barSource,query,dialogSource,css,js]=await Promise.all(['home.html','workspace.html','query-tools.html','dialogs.html','workspace.css','workspace.js'].map(read));
 const home=homeSource.replace('<!--HOME-COMMON-->',common.map(id=>routeLink(id,true)).join(''))
  .replace('<!--HOME-GROUPS-->',sections(groups.slice(0,3).map(group=>({...group,ids:group.ids.filter(id=>!common.includes(id))}))));
 const bar=barSource.replace('<!--SEARCH-ICON-->',icon('search')).replace('<!--LIST-ICON-->',icon('directory'));
 const dialogs=dialogSource.replace('<!--DIALOG-ROUTES-->',sections([{label:'首页',ids:['home']},...groups]))
  .replace('<!--MOBILE-ROUTES-->',mobileNavigation()).replace('<!--SEARCH-ICON-->',icon('search'));
 template=template.replace(/<!--WS-[A-Z]+-->[\s\S]*?<!--\/WS-[A-Z]+-->/g,'').replace(/<style id="buaa-workspace-style">[\s\S]*?<\/style>\s*/g,'');
 const block=(name,html)=>'<!--WS-'+name+'-->'+html+'<!--/WS-'+name+'-->';
 template=template.replace('<main>','<main>'+block('BAR',bar));
 template=template.replace('<section id="queryView"',block('HOME',home)+block('GALLERY','<section id="galleryView" class="view" aria-label="活动记录"><div class="gallery-header"><p>查看活动与照片，也可以发布新的活动记录。</p><a href="https://buaa-volunteer-activity-wall-2026.liuhaoyuray.chatgpt.site" target="_blank" rel="noopener">在新窗口打开 ↗</a></div><iframe class="gallery-frame" title="活动记录与照片" src="https://buaa-volunteer-activity-wall-2026.liuhaoyuray.chatgpt.site" loading="lazy"></iframe></section>')+'<section id="queryView"');
 template=template.replace('<section id="queryView"',block('LEAGUE','<section id="leagueView" class="view" aria-label="团统数据查询"><iframe class="league-frame" title="团统数据查询" src="league/index.html" loading="lazy"></iframe></section>')+'<section id="queryView"');
 template=template.replace('<div class="results" id="results">',block('QUERY',query)+'<div class="results" id="results">');
 template=template.replace('<div class="results" id="results"></div>','<div class="results" id="results"></div>'+block('PAGER','<div id="wsPagination" class="ws-pagination" aria-label="查询结果分页"></div>'));
 template=template.replace('<script>/*__DATA__*/</script>',block('DIALOGS',dialogs)+'<script>/*__DATA__*/</script>');
 template=template.replace('</head>','<style id="buaa-workspace-style">\n'+css+'\n</style>\n</head>');
 app=app.replace(/\n\/\* WORKSPACE_UPGRADE_START \*\/[\s\S]*?\/\* WORKSPACE_UPGRADE_END \*\//g,'');
 if(!app.includes('"league":['))app=app.replace('const titles={','const titles={"league":["团统数据","查询团组织和团员统计。"],');
 if(!app.includes('"gallery":['))app=app.replace('const titles={','const titles={"gallery":["活动记录","记录两部门的活动和照片。"],');
 if(!app.includes('"home":["部门工作台"'))app=app.replace('const titles={','const titles={"home":["部门工作台","把两部门的日常协作，安排得更从容。"],');
 app=app.replace("if(view==='duty')renderDuty()}","if(view==='duty')renderDuty();if(window.WorkspaceApp)window.WorkspaceApp.onView(view)}");
 app=app.replace('function renderResults(){','function renderResultsOriginal(){').replace('function runQuery(){','function runQueryOriginal(){')
  .replace('function persistSelectionOriginal(){','function persistSelection(){');
 app=app.replace('visibleBottom=Math.min(innerHeight,rect.bottom)','visibleBottom=Math.min(innerHeight,rect.bottom,document.querySelector(\'.ws-mobile-nav\')?.getBoundingClientRect().top||innerHeight)');
 app=app.replace(/frame\.src='lottery\.html\?v=[^']*'/,"frame.src='lottery.html?v=20261024-workspace3'");
 const navigation=Object.entries(routes).map(([id,[label,description,aliases]])=>({id,label,description,aliases:aliases||'',icon:icon(id),group:groups.find(group=>group.ids.includes(id))?.label||''}));
 app+='\n/* WORKSPACE_UPGRADE_START */\n'+js.replace('/*__NAVIGATION__*/[]',()=>JSON.stringify(navigation))+'\nwindow.addEventListener("message",e=>{const f=document.querySelector(".league-frame");if(f&&e.source===f.contentWindow&&e.origin===location.origin&&e.data?.type==="league-height"&&Number.isFinite(e.data.height))f.style.height=Math.min(30000,Math.max(850,e.data.height))+"px"});\n/* WORKSPACE_UPGRADE_END */';
 await fs.mkdir(path.join(root,'public/league'),{recursive:true});
 for(const name of ['index.html','league.css','league.js','model.mjs','data.json'])await fs.copyFile(path.join(root,'features/league',name),path.join(root,'public/league',name));
 return {template,app};
}

export async function applyWorkspaceShell(root,template,app){
 const css=await fs.readFile(path.join(root,'features/workspace/shell.css'),'utf8');
 const sidebar=routeLink('home')+groups.filter(group=>group.sidebar.length).map(group=>
  '<div class="ws-nav-group"><p>'+group.label+'</p>'+group.sidebar.map(id=>routeLink(id)).join('')+'</div>').join('');
 const utility='<button type="button" id="officeMore" class="ws-all-tools" aria-haspopup="dialog">'+icon('more')+'<span>全部功能</span></button>';
 template=template.replace(/<nav aria-label="主导航">[\s\S]*?<\/nav>\s*<button id="officeMore"[\s\S]*?<\/button>/,
  '<nav aria-label="主导航">'+sidebar+'</nav>'+utility);
 // The source page may still have a selection button and statistics in its original sidebar.
 template=template.replace(/<aside>[\s\S]*?<\/aside>/,markup=>markup
  .replace(/<button\b[^>]*id="openSelection"[^>]*>[\s\S]*?<\/button>/,'')
  .replace(/<div class="sidebar-foot">[\s\S]*?<\/div>/,'')
  .replace('2026 AUTUMN · 工作台','北航校团委'));
 template=template.replace(/<header class="top">[\s\S]*?<\/header>/,
  '<header class="top"><div><h1 id="pageTitle">查空闲</h1><p class="intro" id="pageIntro"></p></div></header>');
 const context='<div class="ws-context-links" id="wsContextLinks" role="navigation" aria-label="人员与排班工具" hidden>'+
  groups[0].ids.map(id=>routeLink(id)).join('')+'</div>';
 template=template.replace(/<div class="ws-context-links" id="wsContextLinks"[\s\S]*?<\/div>/,'')
  .replace(/(<header class="top">[\s\S]*?<\/header>)/,'$1'+context);
 if(!template.includes('class="ws-query-filters"')){
  template=template.replace(/(<section id="queryView"[^>]*>[\s\S]*?<div class="fields">)([\s\S]*?)(<\/div>)(?=\s*<div class="quick">)/,
   (_,start,fields,end)=>{
    const filter=/<label>[^<]*<(?:select|input) id="(?:campus|college|role|search)"[\s\S]*?<\/label>/g;
    const extra=fields.match(filter);
    if(extra?.length!==4)throw Error('Availability query filters changed');
    return start+fields.replace(filter,'')+end+
     '<details class="ws-query-filters"><summary>更多筛选<span id="wsFilterCount"></span></summary><div class="fields">'+extra.join('')+'</div></details>';
   });
 }
 template=template.replace(/<div class="summary" id="summary"><\/div>/,'')
  .replace(/(<button id="copyFree"[^>]*>[^<]*<\/button>)\s*<button id="exportQuery"[^>]*>[^<]*<\/button>/,'$1')
  .replace(/<p class="muted small" style="margin-bottom:18px">“空闲”[^<]*<\/p>/g,'')
  .replace(/<section class="card ws-display-settings">[\s\S]*?<\/section>/g,'')
  .replace(/<section id="settingsView"([^>]*)>/,match=>match+
   '<section class="card ws-display-settings"><div><h2>显示设置</h2><p class="muted">提高文字和边框的对比度。</p></div><button id="displayMode" aria-pressed="false">开启高对比</button></section>');
 // Keep integrations repeatable when the timetable source has not changed.
 template=template.replace(/<style id="buaa-workspace-shell">[\s\S]*?<\/style>\s*/g,'')
  .replace('</head>','<style id="buaa-workspace-shell">\n'+css+'\n</style>\n</head>');
 app=app.replace(/\$\('sidebarCount'\)\.textContent=[^\n]*\r?\n/,'')
  .replace("$('summary').innerHTML='';",'')
  .replace(/^\s*\$\('summary'\)\.innerHTML=[^\n]*\n/m,'')
  .replaceAll("clear?'恢复氛围效果':'切换高对比'","clear?'关闭高对比':'开启高对比'");
 return {template,app};
}
