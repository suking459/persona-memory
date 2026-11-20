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
  const proposed=proposeMemoryConsolidation(pm,draft);
  assert.equal(proposed.evidenceVerified,false);
  const candidate=proposed.candidates[0];
  assert.equal(proposeMemoryConsolidation(pm,draft).candidates[0].id,candidate.id);
  assert.equal(pm.searchMemories({subject,keys:[summary.key]}).matches.length,0);
  const reloaded=await PersonaMemory.open({store:new MemorySnapshotStore({snapshot:pm.export()}),clock:()=>2000});
  const revised=reloaded.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'Current checks use Linux. 日本語.'}});
  const approved=reloaded.acceptCandidate(revised.id,{expectedRevision:revised.revision}).record;
  assert.equal(approved.assertion,'inferred');
  assert.equal(approved.derivedFrom.length,2);
  assert.equal(reloaded.getMemory('a').value,'Linux only');
  reloaded.putMemory({id:'new-a',subject,kind:'fact',key:'environment',value:'Windows only',replaceId:'a'});
  assert.equal(reloaded.getMemory(approved.id),null);
  assert.throws(()=>proposeMemoryConsolidation(reloaded,draft),/unavailable or changed/);
  assert.equal(reloaded.getMemory('b').value,'日本語: run checks');
});

test('mixed scopes, altered fingerprints, repeated evidence and invalid batch entries fail atomically',()=>{
  const {pm,sources,summary}=fixture();
  pm.putMemory({id:'foreign',subject:foreign,kind:'fact',key:'private',value:'Foreign data'});
  const read=readConsolidationSources(pm,{subject,sources});
  const before=pm.export(),batch={subject,sources:read.sources,summaries:[summary],evidenceId:'merge'};
  assert.throws(()=>readConsolidationSources(pm,{subject,sources:[sources[0],{id:'foreign',revision:1}]}),/unavailable or changed/);
  assert.throws(()=>proposeMemoryConsolidation(pm,{...batch,sources:[sources[0],read.sources[1]]}),/fingerprint/);
  assert.throws(()=>proposeMemoryConsolidation(pm,{...batch,summaries:[summary,{...summary,key:'summary/bad',sourceIds:['a','a']}]}),/distinct/);
  assert.throws(()=>proposeMemoryConsolidation(pm,{...batch,summaries:[summary,summary]}),/distinct/);
  assert.deepEqual(pm.export(),before);
  const candidate=proposeMemoryConsolidation(pm,batch).candidates[0];
  const rejected=pm.rejectCandidate(candidate.id,{expectedRevision:1,reason:'Owner declined'});
  assert.equal(rejected.status,'rejected');
  assert.equal(proposeMemoryConsolidation(pm,batch).candidates[0].status,'rejected');
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
  assert.throws(()=>proposeMemoryConsolidation(pm,ready),/unavailable or changed/);
  assert.equal(pm.listCandidates({subject}).length,0);
});
