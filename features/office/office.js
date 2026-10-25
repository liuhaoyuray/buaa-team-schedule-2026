(() => {
 'use strict';
 const colleges=/*__COLLEGE_DATA__*/;
 function renderColleges(){const q=$('collegeSearch').value.trim().replace(/\s/g,'');const numeric=q.match(/^(\d{1,2})(?:系)?$/);const rows=colleges.filter(x=>!q||(numeric?x.code===Number(numeric[1]):x.name.includes(q)));$('collegeCount').textContent=rows.length+' / '+colleges.length+' 组';$('collegeResults').innerHTML=rows.map(x=>'<article class="college-item"><span class="college-code">'+x.code+'<small>系</small></span><strong>'+escapeHTML(x.name)+'</strong><button data-copy-college="'+x.code+'">复制系号</button></article>').join('')||'<div class="ws-empty">模板中未找到这一单位，请确认名称或补充系号。</div>';}
 $('collegeSearch').oninput=renderColleges;$('collegeClear').onclick=()=>{$('collegeSearch').value='';renderColleges();$('collegeSearch').focus();};
 document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.collegeQuery){$('collegeSearch').value=b.dataset.collegeQuery;renderColleges();}if(b.dataset.copyCollege){try{await navigator.clipboard.writeText(b.dataset.copyCollege);toast('系号 '+b.dataset.copyCollege+' 已复制');}catch{toast('请手动复制系号：'+b.dataset.copyCollege);}}});
 renderColleges();
})();
