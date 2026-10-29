import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,MemorySnapshotStore} from '../src/index.js';
import {createMemoryBridge} from '../adapters/memory/index.js';
const subject={type:'project',id:'audit'};
const input=(id,extra={})=>({id,subject,kind:'fact',key:'setting',value:id,...extra});
test('disconnected retained intervals cannot overlap even if immediate neighbours were pruned',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now});pm.putMemory(input('a'));
  now=1100;pm.putMemory(input('b',{replaceId:'a'}));now=1200;pm.putMemory(input('c',{replaceId:'b'}));
  now=1300;pm.putMemory(input('d',{replaceId:'c'}));
  const bad=pm.export();delete bad.memories.b;delete bad.memories.c;
  bad.memories.a.validUntil=1250;bad.memories.d.validFrom=1150;
  const before=pm.export();assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('a schema 4 snapshot cannot silently downgrade future semantics by changing only its header',()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory(input('a',{validFrom:2000}));
  const bad=pm.export();bad.schemaVersion=3;const before=pm.export();
  assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('expired head fragments cannot restart revision one while old history remains',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now});pm.putMemory(input('a'));
  now=1100;pm.putMemory(input('b',{replaceId:'a',expiresAt:1200}));now=1200;pm.maintain();const before=pm.export();
  assert.throws(()=>pm.putMemory(input('c')),{code:'ERR_MEMORY_CONFLICT'});assert.deepEqual(pm.export(),before);
  pm.forgetMemory('a');assert.equal(pm.putMemory(input('c')).revision,1);
});
test('retained versions cannot describe a duplicate revision in a disconnected chain',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now});pm.putMemory(input('a'));
  now=1100;pm.putMemory(input('b',{replaceId:'a'}));now=1200;pm.putMemory(input('c',{replaceId:'b'}));
  const bad=pm.export();delete bad.memories.b;bad.memories.c.revision=1;delete bad.memories.c.supersedes;
  const before=pm.export();assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('a bounded number of import previews also has a bounded combined byte size',()=>{
  const source=new PersonaMemory({clock:()=>1000});
  for(let i=0;i<40;i++)source.putMemory(input('v'+i,{key:'field'+i,value:'x'.repeat(7900)}));
  const bundle=source.exportMemories({subject}),target=new PersonaMemory({clock:()=>1000});
  for(let i=0;i<40;i++)target.previewMemoryImport(bundle,{mappings:[{from:subject,to:subject}]});
  const bytes=Buffer.byteLength(JSON.stringify([...target._imports.values()]));
  assert.ok(bytes<=9*1024*1024,'preview bytes: '+bytes);
});
test('forgetting a nonexistent ID also releases preview values that referred to that transfer record',()=>{
  const source=new PersonaMemory({clock:()=>1000});source.putMemory(input('a'));
  const target=new PersonaMemory({clock:()=>1000});
  target.previewMemoryImport(source.exportMemories({subject}),{mappings:[{from:subject,to:subject}]});
  target.forgetMemory('a');assert.equal(target._imports.size,0);
});
test('a model bridge waiting for async persistence cannot start a model call after timeout',async()=>{
  const backing=new MemorySnapshotStore();let release;
  const store={read:()=>backing.read(),write:(snapshot,options)=>new Promise(resolve=>{release=async()=>resolve(await backing.write(snapshot,options));})};
  const pm=await PersonaMemory.open({store,clock:()=>1000});pm.putMemory(input('a'));let calls=0;
  const bridge=createMemoryBridge(pm,{subject,timeoutMs:15,budget:3000});
  await assert.rejects(bridge.invoke({text:'setting',turnId:'slow'},()=>{calls++;return 'answer';}),{code:'ERR_TURN_TIMEOUT'});
  store.write=(...args)=>backing.write(...args);await release();
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(calls,0);assert.equal(pm.export().uses.length,0);
});
test('validity metadata is preserved in the actual model input and async usage persists once',async()=>{
  const store=new MemorySnapshotStore(),pm=await PersonaMemory.open({store,clock:()=>1000});pm.putMemory(input('a',{validFrom:900}));
  const result=await createMemoryBridge(pm,{subject,budget:3000}).invoke({text:'setting',turnId:'model'},({memory})=>{
    const record=JSON.parse(memory.split('\n')[1].slice(2));assert.equal(record.validFrom,900);assert.equal(record.validUntil,null);return 'done';
  });
  assert.equal(result.usage.memoryCount,1);assert.equal((await PersonaMemory.open({store,clock:()=>1000})).export().uses.length,1);
});
