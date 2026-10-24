(() => {
 'use strict';
 const frame=document.getElementById('lotteryFrame'),shell=document.getElementById('lotteryShell');
 const loading=document.getElementById('lotteryLoading'),button=document.getElementById('lotteryFullscreen');
 const targetOrigin=location.protocol==='file:'?'*':location.origin;
 let active=false,loaded=false;
 function viewport(){
  if(!loaded||!active)return;
  const rect=frame.getBoundingClientRect(),aside=document.querySelector('body>aside');
  const stickyBottom=aside&&getComputedStyle(aside).position==='sticky'?Math.max(0,aside.getBoundingClientRect().bottom+8):0;
  const visibleTop=Math.max(0,rect.top,stickyBottom),visibleBottom=Math.min(innerHeight,rect.bottom);
  frame.contentWindow.postMessage({type:'buaa-lottery-viewport',top:Math.max(0,visibleTop-rect.top),height:Math.max(120,visibleBottom-visibleTop)},targetOrigin);
 }
 function notify(){if(loaded){frame.contentWindow.postMessage({type:'buaa-lottery-visibility',active},targetOrigin);viewport();}}
 window.LotteryPanel={setActive(value){
  active=Boolean(value);
  if(active&&!frame.hasAttribute('src'))frame.src='lottery.html';
  if(active&&location.hash!=='#lottery')history.replaceState(null,'','#lottery');
  else if(!active&&location.hash==='#lottery')history.replaceState(null,'',location.pathname+location.search);
  requestAnimationFrame(notify);
 }};
 frame.addEventListener('load',()=>{if(!frame.hasAttribute('src'))return;loaded=true;loading.hidden=true;notify();});
 window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||(location.protocol!=='file:'&&event.origin!==location.origin))return;
  if(event.data?.type==='buaa-lottery-height'&&Number.isFinite(event.data.height)&&event.data.height>=100&&event.data.height<=10000)frame.style.height=Math.ceil(event.data.height)+'px';
  if(event.data?.type==='buaa-lottery-modal')viewport();
 });
 window.addEventListener('resize',viewport);
 window.addEventListener('scroll',viewport,{passive:true});
 document.addEventListener('fullscreenchange',()=>requestAnimationFrame(viewport));
 button.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(shell.requestFullscreen)await shell.requestFullscreen();else toast('当前浏览器不支持全屏，可使用浏览器的全屏模式。');}catch{toast('未能进入全屏，请使用浏览器的全屏模式。');}});
 window.addEventListener('hashchange',()=>{if(location.hash==='#lottery')setView('lottery');});
 if(location.hash==='#lottery')setView('lottery');
})();
