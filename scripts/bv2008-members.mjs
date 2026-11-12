import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {writeUserscript} from './bv2008-userscript.mjs';

const require = createRequire(import.meta.url);
const Zip = require('../features/hours/vendor/jszip-3.10.1.min.js');

export async function writeMemberImport(root, output = path.join(root, 'public')) {
  const feature = path.join(root, 'features/bv2008-members');
  const hours = path.join(root, 'features/hours');
  const zip = new Zip();
  for (const file of await fs.readdir(path.join(feature, 'extension'))) {
    zip.file(file, await fs.readFile(path.join(feature, 'extension', file)));
  }
  for (const file of ['io.mjs', 'core.mjs']) {
    zip.file('shared/' + file, await fs.readFile(path.join(hours, file)));
  }
  for (const file of ['exceljs-4.4.0.min.js', 'exceljs-LICENSE.txt']) {
    zip.file('vendor/' + file, await fs.readFile(path.join(hours, 'vendor', file)));
  }
  const date = new Date(Date.UTC(2026, 10, 10, 0, 0));
  zip.forEach((_, file) => { file.date = date; });
  await fs.mkdir(output, {recursive: true});
  await fs.writeFile(path.join(output, 'bv2008-member-import.zip'),
    await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE', streamFiles: true}));
  await fs.copyFile(path.join(feature, 'guide.html'), path.join(output, 'bv2008-members.html'));
  await writeUserscript(root, output);
}
