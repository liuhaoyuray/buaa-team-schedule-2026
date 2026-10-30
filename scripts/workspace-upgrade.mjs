import fs from 'node:fs/promises';
import path from 'node:path';
export async function applyWorkspaceUpgrade(root,template,app){
 const dir=path.join(root,'features/workspace');
 const read=name=>fs.readFile(path.join(dir,name),'utf8');
 const [home,bar,query,dialogs,css,js]=await Promise.all(['home.html','workspace.html','query-tools.html','dialogs.html','workspace.css','workspace.js'].map(read));
 template=template.replace(/<!--WS-[A-Z]+-->[\s\S]*?<!--\/WS-[A-Z]+-->/g,'').replace(/<style id="buaa-workspace-style">[\s\S]*?<\/style>\s*/g,'');
 const block=(name,html)=>'<!--WS-'+name+'-->'+html+'<!--/WS-'+name+'-->';
 template=template.replace('<nav aria-label="主导航">','<nav aria-label="主导航">'+block('NAV','<button data-view="home"><span class="nav-icon" aria-hidden="true">⌂</span>部门工作台</button>'));
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
 app=app.replace('function renderResults(){','function renderResultsOriginal(){').replace('function runQuery(){','function runQueryOriginal(){').replace('function persistSelection(){','function persistSelectionOriginal(){');
 app=app.replace('visibleBottom=Math.min(innerHeight,rect.bottom)','visibleBottom=Math.min(innerHeight,rect.bottom,document.querySelector(\'.ws-mobile-nav\')?.getBoundingClientRect().top||innerHeight)');
 app=app.replace(/frame\.src='lottery\.html\?v=[^']*'/,"frame.src='lottery.html?v=20261024-workspace3'");
 app+='\n/* WORKSPACE_UPGRADE_START */\n'+js+'\nwindow.addEventListener("message",e=>{const f=document.querySelector(".league-frame");if(f&&e.source===f.contentWindow&&e.origin===location.origin&&e.data?.type==="league-height"&&Number.isFinite(e.data.height))f.style.height=Math.min(30000,Math.max(850,e.data.height))+"px"});\n/* WORKSPACE_UPGRADE_END */';
 await fs.mkdir(path.join(root,'public/league'),{recursive:true});
 for(const name of ['index.html','league.css','league.js','model.mjs','data.json'])await fs.copyFile(path.join(root,'features/league',name),path.join(root,'public/league',name));
 return {template,app};
}
