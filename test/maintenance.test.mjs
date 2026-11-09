import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,MemorySnapshotStore,previewMemoryMaintenance,applyMemoryMaintenance} from '../src/index.js';
const subject={type:'project',id:'p'},other={type:'project',id:'other'};
const put=(pm,key,extra={})=>pm.putMemory({subject,kind:'fact',key,value:'Synthetic evidence',...extra});
test('maintenance preview is scoped and body-free; apply commits expired heads/candidates atomically',async()=>{
  let now=1000;const pm=await PersonaMemory.open({store:new MemorySnapshotStore(),clock:()=>now});
  put(pm,'expired',{expiresAt:2000});put(pm,'live');put(pm,'foreign',{subject:other,expiresAt:2000});
  pm.proposeMemory({memory:{subject,kind:'fact',key:'pending',value:'PRIVATE BODY',evidenceId:'e'},ttlHours:0});await pm.persist();now=2000;
  const before=pm.export(),plan=await previewMemoryMaintenance(pm,{subject});assert.deepEqual(pm.export(),before);assert.equal(JSON.stringify(plan).includes('PRIVATE BODY'),false);
  assert.equal(plan.impact.memories,1);assert.equal(plan.impact.candidates,1);const result=await applyMemoryMaintenance(pm,plan);
  assert.equal(result.committed,true);assert.deepEqual(result.removed,{memories:1,candidates:1});
  const loaded=await PersonaMemory.open({store:pm._store,clock:()=>now});assert.equal(loaded.listMemories({subject,includeInactive:true}).length,1);assert.equal(loaded.listMemories({subject:other,includeInactive:true}).length,1);
});
test('expired historical nodes never forget a newer live or future head',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=put(pm,'live',{expiresAt:2000}),b=put(pm,'future',{expiresAt:2000});
  now=1500;put(pm,'live',{replaceId:a.id,expiresAt:null});put(pm,'future',{replaceId:b.id,validFrom:4000,expiresAt:5000});now=2500;
  const plan=await previewMemoryMaintenance(pm,{subject});assert.equal(plan.targets.length,0);const before=pm.export();
  assert.equal((await applyMemoryMaintenance(pm,plan)).committed,false);assert.deepEqual(pm.export(),before);
});
test('maintenance refuses cascade into a corrected currently usable descendant',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=put(pm,'source',{expiresAt:2000}),b=put(pm,'derived',{derivedFrom:[{id:a.id,revision:1}]});
  now=1500;put(pm,'derived',{replaceId:b.id,value:'Independent corrected value',expiresAt:null});now=2500;
  const plan=await previewMemoryMaintenance(pm,{subject});assert.ok(plan.skipped.some(s=>s.id===a.id&&s.reason==='usable-dependent'));assert.equal(plan.targets.length,0);
  await applyMemoryMaintenance(pm,plan);assert.equal(pm.listMemories({subject})[0].value,'Independent corrected value');
});
test('expired dependencies and unusable derived history can be removed together within limits',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=put(pm,'source',{expiresAt:2000});put(pm,'derived',{derivedFrom:[{id:a.id,revision:1}]});now=2000;
  const plan=await previewMemoryMaintenance(pm,{subject});assert.equal(plan.impact.memories,2);const r=await applyMemoryMaintenance(pm,plan);assert.equal(r.removed.memories,2);
});
test('a descendant becoming effective after preview cannot be deleted by the old plan',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=put(pm,'source',{expiresAt:2000}),b=put(pm,'derived',{derivedFrom:[{id:a.id,revision:1}]});
  now=1500;put(pm,'derived',{replaceId:b.id,validFrom:4000,expiresAt:null});now=2500;const plan=await previewMemoryMaintenance(pm,{subject});
  assert.ok(plan.targets.some(t=>t.id===a.id));now=4000;const before=pm.export();await assert.rejects(applyMemoryMaintenance(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});assert.deepEqual(pm.export(),before);
});
test('changed snapshot, configuration, expiry and tampered plans fail without deletion',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now});put(pm,'expired',{expiresAt:1000});let plan=await previewMemoryMaintenance(pm,{subject});
  await assert.rejects(applyMemoryMaintenance(pm,{...plan,limit:32}),/invalid management/);
  put(pm,'new');let before=pm.export();await assert.rejects(applyMemoryMaintenance(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});assert.deepEqual(pm.export(),before);
  plan=await previewMemoryMaintenance(pm,{subject});now+=600000;before=pm.export();await assert.rejects(applyMemoryMaintenance(pm,plan),{code:'ERR_MANAGEMENT_EXPIRED'});assert.deepEqual(pm.export(),before);
});
test('maintenance selection is bounded and reports remaining work without automatic looping',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});for(let i=0;i<40;i++)put(pm,'expired-'+i,{expiresAt:1000});
  const plan=await previewMemoryMaintenance(pm,{subject,limit:3});assert.equal(plan.targets.length,3);assert.equal(plan.considered,3);assert.equal(plan.remaining,37);
  assert.equal((await applyMemoryMaintenance(pm,plan)).removed.memories,3);assert.equal(pm.diagnostics().memories,37);
});
test('persistent failure preserves live memory and the old durable snapshot',async()=>{
  const backing=new MemorySnapshotStore();let fail=false;const store={read:()=>backing.read(),write:(s,o)=>fail?Promise.reject(Error('synthetic failure')):backing.write(s,o)};
  const pm=await PersonaMemory.open({store,clock:()=>1000});put(pm,'expired',{expiresAt:1000});await pm.persist();const before=pm.export(),plan=await previewMemoryMaintenance(pm,{subject});fail=true;
  await assert.rejects(applyMemoryMaintenance(pm,plan));assert.deepEqual(pm.export(),before);assert.deepEqual((await backing.read()).snapshot,before);
});
test('preview rejects invalid limits and getter inputs before side effects',async()=>{
  const pm=new PersonaMemory();let calls=0;for(const limit of [0,33,1.5,NaN])await assert.rejects(previewMemoryMaintenance(pm,{subject,limit}));
  await assert.rejects(previewMemoryMaintenance(pm,{get subject(){calls++;return subject;}}));assert.equal(calls,0);
});
test('maintenance scan and cascade caps reject excessive work without partial mutation',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});const seed=put(pm,'seed',{expiresAt:2000}),snapshot=pm.export();
  snapshot.memories=Object.fromEntries(Array.from({length:5001},(_,i)=>['r'+i,{...seed,id:'r'+i,key:'k'+i}]));pm.import(snapshot);
  const before=pm.export();await assert.rejects(previewMemoryMaintenance(pm,{subject}),/scan supports/);assert.deepEqual(pm.export(),before);
  let now=1000;const graph=new PersonaMemory({clock:()=>now}),source=put(graph,'source',{id:'a-source',expiresAt:2000});
  for(let i=0;i<512;i++)put(graph,'child-'+i,{id:'z-child-'+i,derivedFrom:[{id:source.id,revision:1}]});now=2500;
  const plan=await previewMemoryMaintenance(graph,{subject});assert.ok(plan.skipped.some(s=>s.id===source.id&&s.reason==='impact-limit'));
  assert.ok(plan.impact.memories+plan.impact.candidates<=512);assert.ok(plan.considered<=32);
});
test('configuration and durable revision races invalidate cleanup before live deletion',async()=>{
  const store=new MemorySnapshotStore(),pm=await PersonaMemory.open({store,clock:()=>1000});put(pm,'expired',{expiresAt:1000});await pm.persist();
  let plan=await previewMemoryMaintenance(pm,{subject});pm.config.historyLimit=99;await assert.rejects(applyMemoryMaintenance(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});
  pm.config.historyLimit=100;plan=await previewMemoryMaintenance(pm,{subject});const otherWriter=await PersonaMemory.open({store,clock:()=>1000});put(otherWriter,'live');await otherWriter.persist();
  await assert.rejects(applyMemoryMaintenance(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});assert.equal((await store.read()).snapshot.memories[plan.targets[0].id].key,'expired');
});
