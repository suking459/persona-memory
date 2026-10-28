import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory,scoreMessage,matchTags,hitTag,sweepTags} from '../src/index.js';
import {parse} from '../adapters/generic/index.js';
import {createPreset} from '../src/presets.js';
const DAY=86400000, start=Date.UTC(2026,0,1);
function memory(config={}) {let now=start;const pm=new PersonaMemory({clock:()=>now,config});return {pm,tick:(ms)=>now+=ms};}
const message=(extra={})=>({chatId:'room',userId:'u',text:'你好',mentionsSelf:true,...extra});

test('configured score cap and transport flags are honored',()=>{
  const {pm}=memory({perMessageCap:1});
  const input=parse(message({text:'你好厉害',eventId:'one',directedToBot:true}));
  assert.equal(input.mentionsSelf,true);assert.equal(input.eventId,'one');
  assert.equal(pm.ingest(input).delta,1);
});
test('explicit botId maps actual mention IDs without conflating persona',()=>{
  const {pm}=memory({botId:'assistant'});
  assert.equal(pm.ingest(message({mentionsSelf:undefined,mentions:['assistant']})).delta,2);
});
test('ordinary directed messages have a daily cap, ambient visitors do not score',()=>{
  const {pm,tick}=memory({attentionWindowSec:0,talkDailyCap:2});
  for(let i=0;i<3;i++){tick(1);pm.ingest(message({mentionsSelf:false,directedToBot:true}));}
  assert.equal(pm.getProfile('room','u').affinity.value,2);
  pm.ingest(message({userId:'v',mentionsSelf:false}));
  assert.equal(pm.getProfile('room','v'),null);
});
test('preview is pure and confirmations count exactly once',()=>{
  const {pm}=memory();pm.ingest(message({text:'好累啊'}));
  const before=pm.export();
  const context=pm.buildContext({chatId:'room',userIds:['u']});
  for(let i=0;i<10;i++)pm.buildBlock({chatId:'room',userIds:['u']});
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.confirmContext(context,{turnId:'turn-1'}).tagCount,1);
  assert.equal(pm.confirmContext(context,{turnId:'turn-1'}).duplicate,true);
  assert.equal(pm.getProfile('room','u').tags[0].injections,1);
});
test('tag evidence version prevents acknowledging removed and recreated tags',()=>{
  const {pm,tick}=memory();pm.setTag({chatId:'room',userId:'u',tag:'待办'});
  const context=pm.buildContext({chatId:'room',userIds:['u']});
  pm.removeTag({chatId:'room',userId:'u',tag:'待办'});
  tick(10);pm.setTag({chatId:'room',userId:'u',tag:'待办'});
  assert.throws(()=>pm.confirmContext(context,{turnId:'stale'}),/unknown/);
});
test('visitor-only context works, maxPeople and zero budget apply to all rows',()=>{
  const {pm}=memory();
  for(const userId of ['a','b'])for(let i=0;i<2;i++)pm.ingest(message({userId,mentionsSelf:false}));
  assert.match(pm.buildBlock({chatId:'room',userIds:['a']}),/来过 2 次/);
  assert.equal(pm.buildContext({chatId:'room',userIds:['a','b'],maxPeople:1}).people.length,1);
  assert.equal(pm.buildBlock({chatId:'room',userIds:['a'],budget:0}),'');
});
test('preview ranks explicit priority before affinity and explains omissions',()=>{
  const {pm}=memory();pm.ingest(message({userId:'a',text:'你好厉害'}));pm.ingest(message({userId:'b'}));
  const c=pm.buildContext({chatId:'room',userIds:['a','b'],priorityUserIds:['b'],maxPeople:1});
  assert.equal(c.people[0].userId,'b');assert.equal(c.omitted[0].reason,'people-limit');
});
test('event dedupe and stale messages cannot reset daily budgets',()=>{
  const {pm,tick}=memory();const first=pm.ingest(message({eventId:'same'}));
  assert.equal(pm.ingest(message({eventId:'same'})).duplicate,true);
  assert.equal(pm.getProfile('room','u').affinity.value,first.delta);
  tick(DAY);pm.ingest(message({eventId:'today'}));
  assert.equal(pm.ingest(message({eventId:'old',ts:start})).ignored,'out-of-order');
});
test('maintenance decays incrementally and preserves actual interaction time',()=>{
  const {pm,tick}=memory();pm.ingest(message({text:'你好厉害'}));
  const last=pm.getProfile('room','u').affinity.lastInteractiveAt;
  tick(DAY);pm.maintain();assert.equal(pm.getProfile('room','u').affinity.value,3);
  tick(DAY);pm.maintain();assert.equal(pm.getProfile('room','u').affinity.value,1);
  assert.equal(pm.getProfile('room','u').affinity.lastInteractiveAt,last);
});
test('configured chat tag scope and instance scope isolate identities',()=>{
  const {pm}=memory({tagScope:'chat'});
  pm.ingest(message({text:'好累'}));pm.ingest(message({chatId:'other'}));
  assert.equal(pm.getProfile('other','u').tags.length,0);
  const other=new PersonaMemory({scope:'tenant-2'});
  assert.throws(()=>other.import(pm.export()),/scope/);
});
test('manual correction removes old status and preserves provenance',()=>{
  const {pm}=memory();pm.setTag({chatId:'room',userId:'u',tag:'找工作',source:'host',eventId:'job-start'});
  pm.setTag({chatId:'room',userId:'u',tag:'已入职',replace:['找工作'],source:'host',eventId:'job-done'});
  const tags=pm.getProfile('room','u').tags;
  assert.deepEqual(tags.map(t=>t.tag),['已入职']);assert.equal(tags[0].evidenceId,'job-done');
});
test('host trust events differ from ordinary praise and deduplicate',()=>{
  const {pm}=memory(createPreset('npc'));pm.ingest(message({text:'你好厉害'}));
  assert.equal(pm.getProfile('room','u').dimensions.trust.value,50);
  pm.recordEvent({chatId:'room',userId:'u',eventId:'quest',type:'promise-kept',changes:{trust:10}});
  pm.recordEvent({chatId:'room',userId:'u',eventId:'quest',type:'promise-kept',changes:{trust:10}});
  assert.equal(pm.getProfile('room','u').dimensions.trust.value,60);
});
test('conservative matching skips simple negation and quoted observations',()=>{
  assert.equal(matchTags('我不是在找工作').length,0);
  assert.equal(matchTags('他说“我在找工作”').length,0);
  assert.ok(matchTags('我在找工作').length);
  assert.equal(matchTags('我在找工作',{压力大:{words:[],advice:''}}).length,0);
});
test('pure tag helpers and profile results cannot mutate internal state',()=>{
  const raw=[{tag:'累',hits:1,lastHitAt:start,addedAt:start,expiresAt:start+DAY,injections:0}];
  const before=structuredClone(raw);hitTag(raw,'累','',start+10);sweepTags(raw,start+10);assert.deepEqual(raw,before);
  const {pm}=memory();pm.ingest(message({text:'好累'}));const p=pm.getProfile('room','u');p.tags[0].tag='改了';assert.notEqual(pm.getProfile('room','u').tags[0].tag,'改了');
});
test('deleting users removes their derived state, dedupe, history and preview acknowledgements',()=>{
  const {pm}=memory();pm.ingest(message({text:'好累',eventId:'x'}));
  const c=pm.buildContext({chatId:'room',userIds:['u']});pm.confirmContext(c,{turnId:'y'});
  pm.deleteUser('u');const state=pm.export();
  assert.equal(pm.getProfile('room','u'),null);
  assert.equal(state.seen.length+state.uses.length+state.history.length,0);
});
test('bounded cleanup expires visitors and caps fragments',()=>{
  const {pm,tick}=memory({maxVisitors:1,maxStyleFragments:3});
  for(const userId of ['a','b'])pm.ingest(message({userId,mentionsSelf:false}));
  pm.ingest(message({text:'今天好棒呀这是个测试'}));pm.maintain();
  assert.equal(pm.listVisitors().length,1);
  assert.ok(Object.keys(pm.export().sessions.room.u.style.catch).length<=3);
  tick(91*DAY);pm.maintain();assert.equal(pm.listVisitors().length,0);
});
test('persistence upgrades v1, restores exact scope, and preserves corrupt originals',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'persona-memory-test-'));
  try {
    const {pm}=memory();pm.ingest(message({text:'好累'}));const v1=pm.export();v1.schemaVersion=1;delete v1.scope;delete v1.tagScope;
    const restored=new PersonaMemory({storage:dir,clock:()=>start});restored.import(v1);restored.flush();
    const read=new PersonaMemory({storage:dir,clock:()=>start});assert.equal(read.getProfile('room','u').tags[0].tag,'最近很累');
    assert.equal(read.export().schemaVersion,2);
    const file=path.join(dir,'default.json');fs.writeFileSync(file,'{bad');
    assert.throws(()=>new PersonaMemory({storage:dir}),/original file preserved/);
    assert.equal(fs.readFileSync(file,'utf8'),'{bad');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid imports are atomic and IDs cannot target object prototypes or paths',()=>{
  const {pm}=memory();const before=pm.export();
  assert.throws(()=>pm.import({schemaVersion:9,sessions:{}}));assert.deepEqual(pm.export(),before);
  assert.throws(()=>pm.ingest(message({userId:'__proto__'})));
  const dangerous=JSON.parse('{"schemaVersion":1,"sessions":{"__proto__":{}}}');
  assert.throws(()=>pm.import(dangerous));
});
