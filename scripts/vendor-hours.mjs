// Fetch pinned npm releases and verify registry SHA-512 before extracting browser assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
const destination=new URL('../features/hours/vendor/',import.meta.url);
await fs.mkdir(destination,{recursive:true});
const manifest=[];
for(const [name,version,asset,license] of [['exceljs','4.4.0','dist/exceljs.min.js','LICENSE'],['jszip','3.10.1','dist/jszip.min.js','LICENSE.markdown']]){
 const meta=await(await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
 const bytes=Buffer.from(await(await fetch(meta.dist.tarball)).arrayBuffer());
 const digest='sha512-'+crypto.createHash('sha512').update(bytes).digest('base64');
 if(digest!==meta.dist.integrity)throw Error('Package integrity mismatch: '+name);
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'buaa-hours-vendor-'));
 await fs.writeFile(path.join(tmp,'package.tgz'),bytes);
 execFileSync('tar',['-xzf',path.join(tmp,'package.tgz'),'-C',tmp,'package/'+asset,'package/'+license]);
 const target=`${name}-${version}.min.js`;
 const bundle=await fs.readFile(path.join(tmp,'package',asset));
 await fs.writeFile(new URL(target,destination),bundle);
 await fs.copyFile(path.join(tmp,'package',license),new URL(`${name}-LICENSE.txt`,destination));
 manifest.push({name,version,registry:meta.dist.tarball,integrity:digest,bundle:target,sha256:crypto.createHash('sha256').update(bundle).digest('hex')});
}
await fs.writeFile(new URL('manifest.json',destination),JSON.stringify(manifest,null,2)+'\n');
console.log('Pinned browser assets verified.');
