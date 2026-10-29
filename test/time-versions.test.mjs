import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
const subject={type:'project',id:'release'};
function setup(config={}){
  let now=1000;const pm=new PersonaMemory({clock:()=>now,config});
  const put=input=>pm.putMemory({subject,kind:'fact',key:'setting',value:'old',...input});
  return {pm,put,at:value=>{now=value;}};
}
test('a scheduled replacement leaves the prior value effective until the exact boundary',()=>{
  const {pm,put,at}=setup();const old=put({id:'old'});at(1100);
  const next=put({id:'next',value:'new',validFrom:2000,replaceId:old.id,expectedRevision:1});
  assert.equal(next.status,'current');assert.equal(pm.getMemory('next'),null);
  assert.equal(pm.listMemories({subject})[0].id,'old');
  assert.equal(pm.searchMemories({subject,query:'old'}).matches[0].record.id,'old');
  assert.ok(pm.buildMemoryContext({subject,budget:3000}).text.includes('"validUntil":2000'));
  at(2000);assert.equal(pm.getMemory('old'),null);assert.equal(pm.getMemory('next').value,'new');
  assert.deepEqual(pm.listMemories({subject}).map(record=>record.id),['next']);
});
test('valid time and known time distinguish late evidence from what was known earlier',()=>{
  const {pm,put,at}=setup();put({id:'a',validFrom:900});at(2000);
  put({id:'b',value:'revised',validFrom:1500,observedAt:1400,replaceId:'a'});
  const read=(at,knownAt)=>pm.getMemoryAt({subject,kind:'fact',key:'setting',at,knownAt});
  assert.equal(read(1600,1800).value,'old');
  assert.equal(read(1600,1800).validUntil,null);
  assert.equal(read(1600,1800).supersededBy,undefined);
  assert.equal(read(1600,2000).value,'revised');
  assert.equal(read(1400,2000).value,'old');
  assert.equal(read(800,2000),null);
  assert.throws(()=>read(1600,2001));assert.equal(read(2500,2000).value,'revised');
});
test('scheduled state TTL starts from activation rather than consuming its entire life while waiting',()=>{
  const {pm,put,at}=setup({stateMemoryTtlHours:1});
  const record=put({kind:'state',validFrom:10000000});
  assert.equal(record.expiresAt,13600000);at(10000000);assert.ok(pm.getMemory(record.id));
  at(13600000);assert.equal(pm.getMemory(record.id),null);
});
test('revision preconditions, old heads and backwards effective changes fail atomically',()=>{
  const {pm,put,at}=setup();const a=put({id:'a',expectedRevision:0});at(1100);
  put({id:'b',replaceId:a.id,validFrom:2000,expectedRevision:1});const before=pm.export();
  for(const input of [{id:'c',replaceId:'a'},{id:'c',replaceId:'b',expectedRevision:1},
    {id:'c',replaceId:'b',validFrom:1900},{id:'c',key:'new',expectedRevision:1}]){
    assert.throws(()=>put(input),{code:'ERR_MEMORY_CONFLICT'});assert.deepEqual(pm.export(),before);
  }
  assert.equal(put({id:'b',replaceId:'a',validFrom:2000,expectedRevision:1}).id,'b');
  assert.deepEqual(pm.export(),before);
});
test('version retention prunes ended intervals and reclaims global capacity without reviving data',()=>{
  const {pm,put,at}=setup({maxVersionsPerMemory:3,maxMemories:3});let head;
  for(let i=0;i<12;i++){at(1000+i);head=put({id:'r'+i,value:i,...(head?{replaceId:head.id}:{})});}
  const versions=pm.listMemories({subject,includeInactive:true});
  assert.deepEqual(versions.map(record=>record.id),['r11','r10','r9']);
  assert.equal(pm.getMemoryAt({subject,kind:'fact',key:'setting',at:1001}),null);
  const restored=new PersonaMemory({config:{maxVersionsPerMemory:3,maxMemories:3},clock:()=>2000});restored.import(pm.export());
  assert.equal(restored.forgetMemory('r8').removed,3);assert.equal(restored.diagnostics().memories,0);
});
test('future intervals cannot be silently pruned to satisfy version retention',()=>{
  const {pm,put}=setup({maxVersionsPerMemory:2});put({id:'a'});
  put({id:'b',validFrom:2000,replaceId:'a'});const before=pm.export();
  assert.throws(()=>put({id:'c',validFrom:3000,replaceId:'b'}),{code:'ERR_MEMORY_CAPACITY'});
  assert.deepEqual(pm.export(),before);assert.equal(pm.getMemory('a').value,'old');
});
test('same-time replacements have one effective value and explicit empty intervals',()=>{
  const {pm,put}=setup();put({id:'a'});put({id:'b',replaceId:'a',value:'last'});
  assert.equal(pm.getMemoryAt({subject,kind:'fact',key:'setting',at:1000}).id,'b');
  assert.equal(pm.getMemory('a',{includeInactive:true}).validUntil,1000);
});
test('schema 3 records migrate to immediate historical intervals, while schema 4 requires timestamps',()=>{
  const {pm,put,at}=setup();put({id:'a'});at(1100);put({id:'b',replaceId:'a'});
  const legacy=pm.export();legacy.schemaVersion=3;
  for(const record of Object.values(legacy.memories)){delete record.validFrom;delete record.validUntil;}
  const restored=new PersonaMemory({clock:()=>2000});restored.import(legacy);
  assert.equal(restored.export().schemaVersion,5);assert.equal(restored.getMemory('a',{includeInactive:true}).validUntil,1100);
  const bad=pm.export();delete bad.memories.a.validFrom;const before=restored.export();
  assert.throws(()=>restored.import(bad));assert.deepEqual(restored.export(),before);
});
test('forged validity intervals and mismatched retained successor boundaries are rejected atomically',()=>{
  const {pm,put,at}=setup();put({id:'a'});at(1100);put({id:'b',replaceId:'a'});
  const before=pm.export();
  for(const change of [snapshot=>snapshot.memories.a.validUntil=1200,
    snapshot=>snapshot.memories.b.validUntil=2000,snapshot=>snapshot.memories.a.validFrom=1200]){
    const bad=structuredClone(before);change(bad);assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
  }
});
test('context built before scheduled activation cannot confirm the old interval after activation',()=>{
  const {pm,put,at}=setup();put({id:'a'});put({id:'b',value:'new',validFrom:1100,replaceId:'a'});
  const context=pm.buildMemoryContext({subject,budget:3000});assert.equal(context.records[0].record.id,'a');
  at(1100);assert.equal(pm.confirmContext(context,{turnId:'late'}).memoryCount,0);
  assert.equal(pm.export().uses.length,1);
});

test('an actual prior 0.7 implementation snapshot migrates record intervals and usage ownership',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-0.7.json',import.meta.url)));
  assert.equal(fixture.snapshot.schemaVersion,3);assert.equal(fixture.snapshot.memories['legacy-a'].validFrom,undefined);
  const pm=new PersonaMemory({clock:()=>2000});pm.import(fixture.snapshot);
  assert.equal(pm.export().schemaVersion,5);
  assert.equal(pm.getMemory('legacy-a',{includeInactive:true}).validUntil,1100);
  assert.equal(pm.getMemory('legacy-b').value,'1.0 after checks');
  assert.equal(pm.export().uses[0].recordIds[0],'legacy-b');
  assert.equal(pm.deleteSubject({type:'project',id:'legacy-0.7'}).removed,2);assert.equal(pm.export().uses.length,0);
});
