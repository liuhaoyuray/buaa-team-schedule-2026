import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {applyHoursUpgrade} from '../scripts/hours-upgrade.mjs';

test('hours entry survives repeated synchronization, and all local assets match pinned sources',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buaa-hours-test-'));
 await fs.mkdir(path.join(root,'features'),{recursive:true});await fs.mkdir(path.join(root,'public'));
 await fs.cp(new URL('../features/hours/',import.meta.url),path.join(root,'features/hours'),{recursive:true});
 const source='<head></head><body><nav aria-label="主导航"></nav><div class="office-utility"></div></body>';
 const first=await applyHoursUpgrade(root,source,'app'),second=await applyHoursUpgrade(root,first.template,first.app);
 assert.equal(first.template,second.template);assert.equal((second.template.match(/href="hours.html"/g)||[]).length,2);
 assert.equal(await fs.readFile(path.join(root,'public/hours.html'),'utf8'),await fs.readFile(new URL('../features/hours/index.html',import.meta.url),'utf8'));
 const manifest=JSON.parse(await fs.readFile(path.join(root,'public/vendor/manifest.json'),'utf8'));
 for(const item of manifest){const content=await fs.readFile(path.join(root,'public/vendor',item.bundle));assert.equal(crypto.createHash('sha256').update(content).digest('hex'),item.sha256);}
});
