import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../features/bv2008-members/extension/activity.js', import.meta.url), 'utf8');
for (const initialIcon of ['eye1', 'eye2']) {
  test('native name reveal supports masked surnames with ' + initialIcon + ' and restores privacy', async () => {
    const name = {textContent: '*小明'};
    let icon = initialIcon, clicks = 0;
    const reveal = {isConnected: true, getAttribute: () => icon, click() {
      clicks++; icon = icon === 'eye1' ? 'eye2' : 'eye1';
      name.textContent = name.textContent === '*小明' ? '王小明' : '*小明';
    }};
    const phoneBox = {querySelector: selector => selector === '.text' ? name : reveal};
    const row = {closest: () => ({querySelectorAll: () => [{textContent:'联系方式'}, {textContent:'姓名'}]}), cells: [{querySelector: () => {throw Error('must not reveal phone number');}}, {querySelector: () => phoneBox}]};
    const context = vm.createContext({__buaaMemberAdapter: {clean: value => value, visible: () => true, timing: {page:100}, wait: async check => check()}});
    vm.runInContext(source, context);
    assert.equal(await context.__buaaActivityAdapter.verifyName(row, '王小明'), true);
    assert.equal(clicks, 2);
    assert.equal(name.textContent, '*小明');
    assert.equal(icon, initialIcon);
    assert.equal(await context.__buaaActivityAdapter.verifyName(row, '李小明'), false, 'a hidden surname must not weaken exact-name matching');
  });
}
