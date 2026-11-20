import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,MemorySnapshotStore,createMemoryConsolidator,readConsolidationSources,proposeMemoryConsolidation} from '../src/index.js';
import {testTimeout} from '../tools/test-limits.mjs';

const subject={type:'project',id:'consolidation'},foreign={type:'project',id:'foreign'};
function fixture(){
  let now=1000;
  const pm=new PersonaMemory({clock:()=>now});
  const a=pm.putMemory({id:'a',subject,kind:'fact',key:'environment',value:'Linux only',expiresAt:4000});
  const b=pm.putMemory({id:'b',subject,kind:'decision',key:'command',value:'日本語: run checks'});
  const sources=[a,b].map(({id,revision})=>({id,revision}));
  const summary={key:'summary/checks',text:'Linux only. 日本語: run checks.',reason:'Combine the environment and command.',sourceIds:['a','b']};
  return {pm,sources,summary,tick:time=>{now=time;}};
}

test('reviewed consolidation preserves originals, round-trips pending review and invalidates derivatives',async()=>{
  const {pm,sources,summary}=fixture();
  const reader=createMemoryConsolidator(pm,{subject});
  const draft=await reader.draft({evidenceId:'session-set',sources},({records})=>{
    assert.deepEqual(records.map(r=>r.value),['Linux only','日本語: run checks']);
    return [summary];
  });
  assert.equal(pm.listCandidates({subject}).length,0);
  const proposed=await proposeMemoryConsolidation(pm,draft);
  assert.equal(proposed.evidenceVerified,false);
  const candidate=proposed.candidates[0];
  assert.equal((await proposeMemoryConsolidation(pm,draft)).candidates[0].id,candidate.id);
  assert.equal(pm.searchMemories({subject,keys:[summary.key]}).matches.length,0);
  const reloaded=await PersonaMemory.open({store:new MemorySnapshotStore({snapshot:pm.export()}),clock:()=>2000});
  const revised=reloaded.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'Current checks use Linux. 日本語.'}});
  const approved=reloaded.acceptCandidate(revised.id,{expectedRevision:revised.revision}).record;
  assert.equal(approved.assertion,'inferred');
  assert.equal(approved.derivedFrom.length,2);
  assert.equal(reloaded.getMemory('a').value,'Linux only');
  reloaded.putMemory({id:'new-a',subject,kind:'fact',key:'environment',value:'Windows only',replaceId:'a'});
  assert.equal(reloaded.getMemory(approved.id),null);
  await assert.rejects(proposeMemoryConsolidation(reloaded,draft),/unavailable or changed/);
  assert.equal(reloaded.getMemory('b').value,'日本語: run checks');
});

test('mixed scopes, altered fingerprints, repeated evidence and invalid batch entries fail atomically',async()=>{
  const {pm,sources,summary}=fixture();
  pm.putMemory({id:'foreign',subject:foreign,kind:'fact',key:'private',value:'Foreign data'});
  const read=await readConsolidationSources(pm,{subject,sources});
  const before=pm.export(),batch={subject,sources:read.sources,summaries:[summary],evidenceId:'merge'};
  await assert.rejects(readConsolidationSources(pm,{subject,sources:[sources[0],{id:'foreign',revision:1}]}),/unavailable or changed/);
  await assert.rejects(proposeMemoryConsolidation(pm,{...batch,sources:[sources[0],read.sources[1]]}),/fingerprint/);
  await assert.rejects(proposeMemoryConsolidation(pm,{...batch,summaries:[summary,{...summary,key:'summary/bad',sourceIds:['a','a']}]}),/distinct/);
  await assert.rejects(proposeMemoryConsolidation(pm,{...batch,summaries:[summary,summary]}),/distinct/);
  assert.deepEqual(pm.export(),before);
  const candidate=(await proposeMemoryConsolidation(pm,batch)).candidates[0];
  const rejected=pm.rejectCandidate(candidate.id,{expectedRevision:1,reason:'Owner declined'});
  assert.equal(rejected.status,'rejected');
  assert.equal((await proposeMemoryConsolidation(pm,batch)).candidates[0].status,'rejected');
});

test('late, expired or forgotten evidence fails before candidate creation',async()=>{
  const {pm,sources,summary,tick}=fixture();
  const reader=createMemoryConsolidator(pm,{subject,timeoutMs:testTimeout(100)});
  let finish,signal;
  const pending=reader.draft({evidenceId:'deadline',sources},(_,options)=>{
    signal=options.signal;
    return new Promise(resolve=>{finish=resolve;});
  });
  await assert.rejects(pending,{code:'ERR_TURN_TIMEOUT'});
  assert.equal(signal.aborted,true);
  finish([summary]);
  const ready=await reader.draft({evidenceId:'expires',sources},()=>[summary]);
  tick(4000);
  await assert.rejects(proposeMemoryConsolidation(pm,ready),/unavailable or changed/);
  assert.equal(pm.listCandidates({subject}).length,0);
});

test('long-lived SDK readers refuse source reads, callbacks and submissions after persisted forgetting',async()=>{
  const {pm,sources,summary}=fixture(),backing=new MemorySnapshotStore({snapshot:pm.export()});
  const open=()=>PersonaMemory.open({store:backing,clock:()=>2000});
  const reader=await open(),owner=await open(),consolidator=createMemoryConsolidator(reader,{subject});
  const input={evidenceId:'old-draft',sources};
  const known=await consolidator.draft(input,()=>[summary]);
  reader.putMemory({subject,kind:'fact',key:'local-unsaved',value:'Preserve this edit.'});
  owner.forgetMemory('a');await owner.persist();
  let called=false;
  await assert.rejects(readConsolidationSources(reader,{subject,sources}),{code:'ERR_STORE_CONFLICT'});
  await assert.rejects(consolidator.draft({...input,evidenceId:'new-draft'},()=>{called=true;return []; }),{code:'ERR_STORE_CONFLICT'});
  await assert.rejects(consolidator.draft(input,()=>{called=true;return []; }),{code:'ERR_STORE_CONFLICT'});
  await assert.rejects(proposeMemoryConsolidation(reader,known),{code:'ERR_STORE_CONFLICT'});
  assert.equal(called,false);
  assert.equal(reader.listCandidates({subject}).length,0);
  assert.equal(reader.listMemories({subject}).find(record=>record.key==='local-unsaved').value,'Preserve this edit.');
  assert.equal((await open()).getMemory('a'),null);
});

test('a persisted change during the summary callback discards the in-flight draft',async()=>{
  const {pm,sources,summary}=fixture(),backing=new MemorySnapshotStore({snapshot:pm.export()});
  const open=()=>PersonaMemory.open({store:backing,clock:()=>2000});
  const reader=await open(),owner=await open(),consolidator=createMemoryConsolidator(reader,{subject});
  await assert.rejects(consolidator.draft({evidenceId:'in-flight',sources},async({records})=>{
    assert.equal(records.length,2);
    owner.forgetMemory('a');await owner.persist();
    return [summary];
  }),{code:'ERR_STORE_CONFLICT'});
  assert.equal(reader.listCandidates({subject}).length,0);
  await reader.reload({ifChanged:true});
  await assert.rejects(consolidator.draft({evidenceId:'in-flight',sources},()=>[]),/unavailable or changed/);
});
