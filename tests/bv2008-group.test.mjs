import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const code = await fs.readFile(new URL('../features/bv2008-members/extension/group-state.js', import.meta.url), 'utf8');

function probe({info, selected, live}) {
  const target = new EventTarget();
  const app = live && {__vue_app__: {config: {globalProperties: {$pinia: {_s: live}}}}};
  const document = {
    querySelector: () => app,
    addEventListener: (...args) => target.addEventListener(...args),
    dispatchEvent: event => target.dispatchEvent(event),
  };
  const sourceWindow = {
    document,
    localStorage: {getItem: key => key === 'zybjpc-user-info' ? info : selected},
  };
  const context = vm.createContext({window: sourceWindow, document, CustomEvent});
  vm.runInContext(code, context);
  return () => {
    let group;
    target.addEventListener('buaa-volunteer-group-result', event => {
      group = JSON.parse(event.detail);
    }, {once: true});
    target.dispatchEvent(new Event('buaa-volunteer-read-group'));
    return group;
  };
}

test('live group state survives absent or stale cache fields and follows a group switch', () => {
  const store = {userInfo: {currOrgInfoActive: {orgId: 'live-a', orgName: '当前团体'}}};
  const read = probe({
    info: JSON.stringify({currOrgInfoActive: {orgId: 'cached', orgName: '缓存团体'}}),
    selected: 'cached',
    live: new Map([['user', store]]),
  });
  assert.deepEqual(read(), {id: 'live-a', name: '当前团体'});
  store.userInfo.currOrgInfoActive = {orgId: 'live-b', orgName: '切换后的团体'};
  assert.deepEqual(read(), {id: 'live-b', name: '切换后的团体'});
  store.userInfo = null;
  assert.equal(read(), null, 'logout must not revive a cached group');
});

test('legacy cache works without userType or a default ID, and supports serialized wrappers', () => {
  const group = {orgId: 'group-a', orgName: '团体甲'};
  assert.deepEqual(probe({info: JSON.stringify({currOrgInfoActive: group})})(), {id: 'group-a', name: '团体甲'});
  assert.deepEqual(probe({info: JSON.stringify({value: {currOrgInfoActive: group}}), selected: '"group-a"'})(),
    {id: 'group-a', name: '团体甲'});
  assert.equal(probe({info: JSON.stringify({currOrgInfoActive: group}), selected: 'another'})(), null);
});
