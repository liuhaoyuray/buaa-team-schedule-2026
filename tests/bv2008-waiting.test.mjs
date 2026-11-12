import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../features/bv2008-members/extension/bv2008.js', import.meta.url), 'utf8');
function helpers(document) {
  const context = vm.createContext({
    document,
    location: {protocol: 'https:', hostname: 'www.bv2008.cn'},
    MutationObserver: class {observe() {} disconnect() {}},
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener() {}, removeEventListener() {},
    getComputedStyle: () => ({visibility: 'visible'}),
  });
  vm.runInContext(source, context);
  return context.__buaaMemberAdapter;
}
const visible = () => ({getClientRects: () => [{}], closest: () => null});

test('ready state is polled even when a property update causes no DOM mutation', async () => {
  const {waitStable} = helpers({body: {}});
  let ready = false;
  setTimeout(() => { ready = true; }, 130);
  assert.equal(await waitStable(() => ready, 1200, 100), true);
});

test('transient validation does not finish a submission or click the button again', async () => {
  let messages = [];
  let open = true;
  let clicks = 0;
  const document = {body: {}, querySelectorAll: () => messages};
  const {submitAndWait} = helpers(document);
  const form = {...visible(), get isConnected() { return open; }, contains: () => false, querySelectorAll: () => []};
  const button = {disabled: false, getAttribute: () => null, classList: {contains: () => false}, click() {
    clicks++;
    const error = {...visible(), textContent: '校验中', matches: () => false};
    const success = {...visible(), textContent: '添加成功', matches: () => false};
    setTimeout(() => { messages = [error]; }, 100);
    setTimeout(() => { messages = []; }, 300);
    setTimeout(() => { messages = [success]; open = false; }, 700);
  }};
  const result = await submitAndWait(form, button, () => false, (_, text) =>
    text === '添加成功' ? {status: 'added'} : {status: 'rejected'});
  assert.equal(result.status, 'added');
  assert.equal(clicks, 1);
});
