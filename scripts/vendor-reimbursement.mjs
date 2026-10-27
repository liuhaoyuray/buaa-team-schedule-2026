import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dest=new URL('../features/reimbursement/vendor/',import.meta.url),manifest=[];
await fs.mkdir(dest,{recursive:true});
async function pkg(name,version,files){
 const meta=await(await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();if(!meta.dist)throw Error('Missing package '+name);
 if((await Promise.all(files.map(([,target])=>fs.stat(new URL(target,dest)).then(()=>true,()=>false)))).every(Boolean)){
  for(const[,file]of files){const content=await fs.readFile(new URL(file,dest));manifest.push({package:name,version,integrity:meta.dist.integrity,file,sha256:crypto.createHash('sha256').update(content).digest('hex')});}return;
 }
 const bytes=Buffer.from(await(await fetch(meta.dist.tarball,{signal:AbortSignal.timeout(90000)})).arrayBuffer()),integrity='sha512-'+crypto.createHash('sha512').update(bytes).digest('base64');
 if(integrity!==meta.dist.integrity)throw Error('Package checksum mismatch');
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'buaa-reimburse-vendor-'));await fs.writeFile(path.join(tmp,'package.tgz'),bytes);
 execFileSync('tar',['-xzf',path.join(tmp,'package.tgz'),'-C',tmp,...files.map(([source])=>'package/'+source)]);
 for(const [source,target]of files){const content=await fs.readFile(path.join(tmp,'package',source));await fs.mkdir(new URL(path.dirname(target)+'/',dest),{recursive:true});await fs.writeFile(new URL(target,dest),content);manifest.push({package:name,version,integrity,file:target,sha256:crypto.createHash('sha256').update(content).digest('hex')});}
}
await pkg('pdfjs-dist','5.6.205',[['build/pdf.mjs','pdfjs/pdf.mjs'],['build/pdf.worker.mjs','pdfjs/pdf.worker.mjs'],['LICENSE','pdfjs/LICENSE.txt'],['cmaps/Adobe-GB1-UCS2.bcmap','pdfjs/cmaps/Adobe-GB1-UCS2.bcmap'],['cmaps/UniGB-UCS2-H.bcmap','pdfjs/cmaps/UniGB-UCS2-H.bcmap']]);
await pkg('tesseract.js','7.0.0',[['dist/tesseract.min.js','ocr/tesseract.min.js'],['dist/worker.min.js','ocr/worker.min.js'],['LICENSE.md','ocr/LICENSE.txt']]);
const core=process.env.CODEX_CORE_PATH||'C:/Users/28776/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/tesseract.js-core',coreFiles=['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js','LICENSE'];
if(await fs.stat(core).catch(()=>null))for(const name of coreFiles){
 const content=await fs.readFile(path.join(core,name)),file='ocr/'+(name==='LICENSE'?'core-LICENSE.txt':name);await fs.writeFile(new URL(file,dest),content);manifest.push({package:'tesseract.js-core',version:'7.0.0',source:'Codex bundled runtime',file,sha256:crypto.createHash('sha256').update(content).digest('hex')});
}
else await pkg('tesseract.js-core','7.0.0',coreFiles.map(name=>[name,'ocr/'+(name==='LICENSE'?'core-LICENSE.txt':name)]));
for(const [source,file]of [['4.0.0_best_int/chi_sim.traineddata.gz','ocr/chi_sim.traineddata.gz']]){
 const url='https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim@1.0.0/'+source,res=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!res.ok)throw Error('Language download: '+res.status);const content=Buffer.from(await res.arrayBuffer());await fs.writeFile(new URL(file,dest),content);manifest.push({package:'@tesseract.js-data/chi_sim',version:'1.0.0',source:url,file,sha256:crypto.createHash('sha256').update(content).digest('hex')});
}
await fs.copyFile(new URL('ocr/core-LICENSE.txt',dest),new URL('ocr/language-LICENSE.txt',dest));
await fs.writeFile(new URL('manifest.json',dest),JSON.stringify(manifest,null,2)+'\n');console.log('Verified PDF/OCR assets ready.');
