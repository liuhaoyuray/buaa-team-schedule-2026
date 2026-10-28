import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../public/engine.js');const E=globalThis.ScheduleEngine;
const p={id:'p',hasTimetable:true},meta={week1:'2026-09-07',maxWeek:19,teachingWeeks:17};
const event={person:'p',kind:'course',day:1,start:'09:00',end:'10:00',weeks:null,uncertain:true};
const run=(e,date,start='09:00',end='10:00',person=p)=>E.evaluate(person,date,start,end,{meta,events:e});
test('missing weeks occupy the known weekly time only',()=>{assert.equal(run([event],'2026-09-07').status,'course');assert.equal(run([event],'2026-09-14').status,'course');assert.equal(run([event],'2026-09-08').status,'free');assert.equal(run([event],'2026-09-07','11:00','12:00').status,'free');assert.equal(run([event],'2026-09-07').events[0].uncertain,false)});
test('variable arrangements occupy only their known weeks and time',()=>{const e={...event,kind:'other',weeks:[2,3]};assert.equal(run([e],'2026-09-07').status,'free');assert.equal(run([e],'2026-09-14').status,'other');assert.equal(run([e],'2026-09-28').status,'free')});
test('missing timetable and unknown end remain incomplete',()=>{assert.equal(run([],'2026-09-07','09:00','10:00',{...p,hasTimetable:false}).status,'unknown');assert.equal(run([{...event,endUnknown:true}],'2026-09-07').status,'unknown')});
