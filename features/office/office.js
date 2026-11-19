(() => {
 'use strict';
 const directory=/*__COLLEGE_DATA__*/;
 const contacts=/*__COLLEGE_CONTACTS__*/;
 const colleges=directory.map(unit=>({...unit,...contacts[unit.code]}));
 $('exportColleges').onclick=async()=>{
  const button=$('exportColleges');
  button.disabled=true;
  try{
   if(!window.ExcelJS)await import('./vendor/exceljs-4.4.0.min.js');
   const workbook=new window.ExcelJS.Workbook();
   const sheet=workbook.addWorksheet('系号对照');
   sheet.columns=[
    {header:'系号',width:12},{header:'学院 / 书院 / 单位',width:42},
    {header:'分团委书记',width:19},{header:'邮箱',width:34}
   ];
   sheet.addRows([...colleges].sort((a,b)=>a.code-b.code).map(({code,name,secretary,email})=>[code,name,secretary||"",email||""]));
   sheet.views=[{state:'frozen',ySplit:1}];
   sheet.autoFilter='A1:D'+sheet.rowCount;
   sheet.getRow(1).height=23;
   sheet.getRow(1).eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF25455F'}};
   });
   download('北航学院系号与分团委联系方式.xlsx',await workbook.xlsx.writeBuffer(),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }catch{
   toast('对照表导出失败，请刷新页面后重试。');
  }finally{
   button.disabled=false;
  }
 };
 function renderColleges() {
  const q=$('collegeSearch').value.trim().replace(/\s/g,'').toLowerCase();
  const numeric=q.match(/^(\d{1,2})(?:系)?$/);
  const rows=colleges.filter(unit=>!q||(numeric
   ? unit.code===Number(numeric[1])
   : [unit.name,unit.alias,unit.secretary,unit.email].some(value=>value?.toLowerCase().includes(q))));
  $('collegeCount').textContent=rows.length+' / '+colleges.length+' 组';
  $('collegeResults').innerHTML=rows.map(unit=>{
   const contact=unit.email
    ? '<span class="college-secretary">分团委书记 '+escapeHTML(unit.secretary)+'</span>'
      +'<a class="college-email" href="mailto:'+escapeHTML(unit.email)+'">'+escapeHTML(unit.email)+'</a>'
    : '';
   return '<article class="college-item"><span class="college-code">'+unit.code+'<small>系</small></span>'
    +'<div class="college-unit"><strong>'+escapeHTML(unit.name)+'</strong>'+contact+'</div>'
    +'<button data-copy-college="'+unit.code+'">复制系号</button></article>';
  }).join('')||'<div class="ws-empty">未找到符合条件的单位。</div>';
 }
 $('collegeSearch').oninput=renderColleges;$('collegeClear').onclick=()=>{$('collegeSearch').value='';renderColleges();$('collegeSearch').focus();};
 document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.collegeQuery){$('collegeSearch').value=b.dataset.collegeQuery;renderColleges();}if(b.dataset.copyCollege){try{await navigator.clipboard.writeText(b.dataset.copyCollege);toast('系号 '+b.dataset.copyCollege+' 已复制');}catch{toast('请手动复制系号：'+b.dataset.copyCollege);}}});
 renderColleges();
})();

window.addEventListener("message",e=>{const f=document.getElementById("localLedger");if(f&&e.source===f.contentWindow&&e.origin===location.origin&&e.data?.type==="office-ledger-height"&&Number.isFinite(e.data.height))f.style.height=Math.min(30000,Math.max(650,e.data.height))+"px";});
