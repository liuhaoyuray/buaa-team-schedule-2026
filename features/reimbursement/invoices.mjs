import {parseInvoice} from './domain.mjs';
let pdfPromise,ocrWorker;
export async function pdfLibrary(){
 if(!pdfPromise)pdfPromise=import('./vendor/pdfjs/pdf.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;return pdf;});
 return pdfPromise;
}
async function recognize(image,progress){
 if(!ocrWorker){
  await new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const script=document.createElement('script');script.src=new URL('./vendor/ocr/tesseract.min.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('文字识别组件加载失败'));document.head.append(script);});
  ocrWorker=await window.Tesseract.createWorker('chi_sim',1,{workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/',import.meta.url).href,langPath:new URL('./vendor/ocr/',import.meta.url).href,workerBlobURL:false,logger:m=>progress('识别发票文字 '+Math.round((m.progress||0)*100)+'%')});
 }
 const result=await ocrWorker.recognize(image);return result.data.text;
}
function lines(items){
 const rows=[];
 for(const item of items){if(!item.str)continue;const y=item.transform[5],x=item.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,text:item.str});}
 return rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n');
}
export async function readInvoice(file,progress=()=>{}){
 let raw='',mode='';
 if(/\.pdf$/i.test(file.name)){
  const pdf=await pdfLibrary(),doc=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true}).promise;
  try{
   // A multi-page upload may contain multiple invoices. Do not silently use one page's amount.
   if(doc.numPages>10)throw Error('发票PDF超过10页，请按单张发票拆开上传。');
   for(let i=1;i<=doc.numPages;i++){
    progress('读取PDF '+i+'/'+doc.numPages);const page=await doc.getPage(i),text=lines((await page.getTextContent()).items);
    if(text.replace(/\s/g,'').length>30){raw+=text+'\n';mode='PDF文字';}
    else{const viewport=page.getViewport({scale:Math.min(2.5,2200/page.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;raw+=await recognize(canvas,progress)+'\n';mode='图片文字识别';}
   }
   if(doc.numPages>1)return {...parseInvoice(raw),amount:'',raw,mode,warnings:['多页PDF请核对包含几张发票，并手动填写本次总额']};
  }finally{await doc.destroy();}
 }else if(/\.(png|jpe?g|webp)$/i.test(file.name)){raw=await recognize(file,progress);mode='图片文字识别';}
 else return {raw:'',date:'',amount:'',invoiceNumber:'',category:'',mode:'手动填写',warnings:['该格式保留原件，请手动填写日期和金额']};
 return {...parseInvoice(raw),raw,mode};
}
export async function closeOcr(){if(ocrWorker){await ocrWorker.terminate();ocrWorker=null;}}
