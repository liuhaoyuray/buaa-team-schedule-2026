import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeMemberImport} from '../scripts/bv2008-members.mjs';

const require = createRequire(import.meta.url);
const Zip = require('../features/hours/vendor/jszip-3.10.1.min.js');
const ExcelJS = require('../features/hours/vendor/exceljs-4.4.0.min.js');

test('installable archive bundles its reader and preserves known and uncertain submissions separately', async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'buaa-members-test-'));
  const shared = path.join(output, 'shared');
  const queuePath = path.join(output, 'queue.mjs');
  const archive = path.join(output, 'bv2008-member-import.zip');
  const guide = path.join(output, 'bv2008-members.html');
  try {
    await writeMemberImport(path.resolve(import.meta.dirname, '..'), output);
    const bytes = await fs.readFile(archive);
    await writeMemberImport(path.resolve(import.meta.dirname, '..'), output);
    assert.deepEqual(await fs.readFile(archive), bytes, 'repeated synchronization should preserve the archive');
    const zip = await Zip.loadAsync(bytes);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
    for (const file of ['background.js', 'index.html', 'app.mjs', 'app.css', 'bv2008.js', 'activity.js',
      'vendor/exceljs-4.4.0.min.js', 'vendor/exceljs-LICENSE.txt']) {
      assert(zip.file(file), file);
    }
    await fs.mkdir(shared);
    for (const name of ['queue.mjs', 'shared/core.mjs', 'shared/io.mjs']) {
      await fs.writeFile(path.join(output, name), await zip.file(name).async('nodebuffer'));
    }
    const {readSheets, readPaste, runQueue, recoverJob, resultCsv, batchKey} = await import(pathToFileURL(queuePath));
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('模拟名单');
    sheet.addRows([
      ['姓名', '证件号码'], ['模拟甲', 'DEMO1'], ['模拟乙', 'DEMO2'], ['模拟丙', 'DEMO3'],
      ['模拟丁', 'DEMO4'], ['模拟重复', 'DEMO1'], ['长数字', 123456789012345678],
    ]);
    const source = await workbook.xlsx.writeBuffer();
    const [selected] = await readSheets(source, ExcelJS);
    const rows = selected.read();
    assert.deepEqual(rows.map(row => row.row), [2, 3, 4, 5, 6, 7]);
    assert.match(rows[4].issue, /相同/);
    assert.match(rows[5].issue, /长数字/);
    assert.deepEqual(readPaste('姓名\t证件号码\r\n模拟甲\tDEMO1').map(row => row.row), [2]);
    assert.notEqual(await batchKey('group-a', selected.name, source), await batchKey('group-b', selected.name, source));

    const activityBook = new ExcelJS.Workbook();
    activityBook.addWorksheet('岗位名单').addRows([
      ['姓名', '志愿者编号', '证件号码'],
      ['模拟甲', '0012', 'DEMO1'], ['模拟乙', '', 'DEMO2'], ['模拟丙', '0012', 'DEMO3'],
    ]);
    const [activitySheet] = await readSheets(await activityBook.xlsx.writeBuffer(), ExcelJS, 'activity');
    const [number, cert, duplicate] = activitySheet.read();
    assert.equal(number.identifier, 'number');
    assert.equal(number.cert, '0012');
    assert.equal(cert.identifier, 'cert');
    assert.match(duplicate.issue, /相同志愿者编号/);
    assert.equal(readPaste('姓名\t志愿者编号\n模拟甲\t0012', 'activity')[0].cert, '0012');
    assert.throws(() => readPaste('模拟甲\t0012', 'activity'), /表头/);

    await fs.writeFile(path.join(output, 'hours-core.mjs'), await zip.file('hours-core.mjs').async('nodebuffer'));
    const {allocateHourDays, hourDates, readHourSheets} = await import(pathToFileURL(path.join(output, 'hours-core.mjs')));
    const hoursBook = new ExcelJS.Workbook();
    hoursBook.addWorksheet('时长').addRows([['姓名','志愿者编号','总时长'],['模拟甲','001',20]]);
    const [hoursSheet] = await readHourSheets(await hoursBook.xlsx.writeBuffer(), ExcelJS);
    const person = hoursSheet.read()[0];
    const days = hourDates(['2026-11-01','2026-11-02','2026-11-03'],'2026-11-01','2026-11-03',false);
    const allocations = allocateHourDays(person, person.total, days, new Set(['2026-11-01']));
    assert.deepEqual(allocations.map(day => [day.date,day.hours]), [['2026-11-02',8],['2026-11-03',8]]);
    assert.equal(person.total - allocations.reduce((sum,day)=>sum+day.hours,0),4);

    const job = recoverJob();
    const submitted = [];
    let checkpoint;
    const options = {
      job, rows, retry: false,
      save: async value => { checkpoint = structuredClone(value); },
      submit: async row => {
        assert.equal(checkpoint.inFlight, row.row);
        submitted.push(row.row);
        if (row.row === 2) return {status: 'rejected', reason: '官网拒绝'};
        if (row.row === 3) return {status: 'added', reason: '官网确认'};
        throw Error('response lost after click');
      },
      stopped: () => false,
      update: () => {},
    };
    await runQueue(options);
    assert.deepEqual(submitted, [2, 3, 4]);
    assert.equal(job.results[4].status, 'unknown');
    assert.equal(checkpoint.inFlight, null);
    assert.equal(job.results[5], undefined);
    await runQueue(options);
    assert.deepEqual(submitted, [2, 3, 4], 'unknown results must block automatic retry');
    assert.doesNotMatch(resultCsv(job, rows), /DEMO|模拟甲/);

    const interrupted = recoverJob({results: {}, inFlight: 5});
    assert.equal(interrupted.results[5].status, 'unknown');
    assert.equal(interrupted.inFlight, null);

    job.results[4] = {status: 'added', reason: '管理员已核对'};
    await runQueue({...options, retry: true, submit: async row => {
      assert.equal(row.row, 2);
      return {status: 'existing', reason: '已是成员'};
    }});
    assert.equal(job.results[2].status, 'existing');
    assert.equal(job.results[3].status, 'added');
    assert.equal(job.results[5], undefined);
  } finally {
    for (const file of [archive, guide, queuePath, path.join(output, 'hours-core.mjs'), path.join(output, 'bv2008-batch-helper.user.js'), path.join(output, 'bv2008-batch-helper.meta.js'), path.join(shared, 'core.mjs'), path.join(shared, 'io.mjs')]) {
      await fs.unlink(file).catch(() => {});
    }
    await fs.rmdir(shared).catch(() => {});
    await fs.rmdir(output);
  }
});
