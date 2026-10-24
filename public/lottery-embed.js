(() => {
 'use strict';
 if (parent === window) return;
 document.documentElement.classList.add('platform-embedded');
 const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
 let lastHeight = 0, scheduled = false;
 function measure() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
   scheduled = false;
   const height = Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height);
   if (height > 100 && height !== lastHeight) {lastHeight = height;parent.postMessage({type:'buaa-lottery-height',height},targetOrigin);}
  });
 }
 new ResizeObserver(measure).observe(document.querySelector('.wrap'));
 window.addEventListener('message', event => {
  if(event.source !== parent || (location.protocol !== 'file:' && event.origin !== location.origin)) return;
  if(event.data?.type==='buaa-lottery-viewport') {
   const {top,height}=event.data;
   if(Number.isFinite(top)&&Number.isFinite(height)&&top>=0&&top<=10000&&height>=120&&height<=10000){
    document.documentElement.style.setProperty('--platform-viewport-top',top+'px');
    document.documentElement.style.setProperty('--platform-viewport-height',height+'px');
   }
   return;
  }
  if(event.data?.type !== 'buaa-lottery-visibility') return;
  if(event.data.active) {
   if(spinning && spinTimer === null) spinTimer = setInterval(() => {const pool=eligiblePeople();if(pool.length)displayPerson(pool[randomIndex(pool.length)]);},75);
   lastHeight=0;measure();
  } else if(spinning) {clearInterval(spinTimer);spinTimer=null;}
 });
 new MutationObserver(()=>{if(document.getElementById('modalLayer').classList.contains('show'))parent.postMessage({type:'buaa-lottery-modal'},targetOrigin);}).observe(document.getElementById('modalLayer'),{attributes:true,attributeFilter:['class']});
 measure();
})();
