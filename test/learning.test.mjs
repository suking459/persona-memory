import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,MemorySnapshotStore} from '../src/index.js';
import {createMemoryLearner} from '../adapters/learning/index.js';
const subject={type:'user',id:'u'},other={type:'user',id:'other'};
const item=(extra={})=>({subject,kind:'preference',key:'format',value:'short',confidence:0.9,...extra});
const setup=options=>{const pm=new PersonaMemory({clock:()=>1000});return {pm,learner:createMemoryLearner(pm,{subject,...options})};};
test('a host-supplied extractor only proposes candidates, persists no raw text and uses host event evidence',async()=>{
  const {pm,learner}=setup();const result=await learner.extract({text:'private message body',eventId:'event'},async(request,{signal})=>{
    assert.equal(request.eventId,'event');assert.equal(signal.aborted,false);assert.deepEqual(request.subjects,[subject]);return [item()];
  });
  assert.equal(result.candidates[0].memory.evidenceId,'event');assert.equal(result.candidates[0].memory.source,'model');
  assert.equal(pm.searchMemories({subject}).matches.length,0);assert.ok(!JSON.stringify(pm.export()).includes('private message body'));
});
test('concurrent/repeated event calls share one extraction and return fresh candidate review status',async()=>{
  const {pm,learner}=setup();let calls=0;const extract=async()=>{calls++;await new Promise(resolve=>setImmediate(resolve));return [item()];};
  const input={text:'format request',eventId:'same'};
  const [a,b]=await Promise.all([learner.extract(input,extract),learner.extract(input,extract)]);assert.equal(calls,1);assert.equal(a.candidates[0].id,b.candidates[0].id);
  pm.rejectCandidate(a.candidates[0].id,{expectedRevision:1});
  assert.equal((await learner.extract(input,extract)).candidates[0].status,'rejected');assert.equal(calls,1);
  await assert.rejects(learner.extract({...input,text:'different'},extract),/different input/);
});
test('failed extraction can retry, while a malformed later row cannot commit an earlier row',async()=>{
  const {pm,learner}=setup(),before=pm.export(),input={eventId:'retry',text:'request'};
  await assert.rejects(learner.extract(input,()=>{throw new Error('offline');}),/offline/);assert.deepEqual(pm.export(),before);
  await assert.rejects(learner.extract(input,()=>[item(),item({key:'bad',value:()=>{}})]));assert.deepEqual(pm.export(),before);
  assert.equal((await learner.extract(input,()=>[item()])).candidates.length,1);
});
test('cross-scope output, unauthorized kinds and authority fields are rejected before any candidate exists',async()=>{
  for(const output of [item({subject:other}),item({kind:'constraint'}),item({source:'host'}),item({experience:{verified:true}})]){
    const {pm,learner}=setup({kinds:['preference']}),before=pm.export();
    await assert.rejects(learner.extract({text:'request',eventId:'scope'},()=>[item(),output]));assert.deepEqual(pm.export(),before);
  }
});
test('extractor timeout requests cancellation and late results cannot write candidates',async()=>{
  const {pm,learner}=setup({timeoutMs:10});let finish,signal;
  const pending=learner.extract({text:'request',eventId:'slow'},(_,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});});
  await assert.rejects(pending,{code:'ERR_TURN_TIMEOUT'});assert.equal(signal.aborted,true);
  finish([item()]);await new Promise(resolve=>setImmediate(resolve));assert.equal(pm.diagnostics().candidates,0);assert.equal(pm.diagnostics().memories,0);
});
test('formal corrections or deletion during extraction invalidate late proposals',async()=>{
  for(const change of [pm=>pm.putMemory({subject,kind:'fact',key:'new',value:'correction'}),pm=>pm.deleteSubject(subject),pm=>pm.clear()]){
    const {pm,learner}=setup();let finish;
    const pending=learner.extract({eventId:'stale',text:'request'},()=>new Promise(resolve=>{finish=resolve;}));
    await new Promise(resolve=>setImmediate(resolve));change(pm);const before=pm.export();finish([item()]);
    await assert.rejects(pending,{code:'ERR_CANDIDATE_CONFLICT'});assert.deepEqual(pm.export(),before);
  }
});
test('rejection during extraction cannot be bypassed by late output for the same evidence',async()=>{
  const {pm,learner}=setup();const prior=pm.proposeMemory({memory:{subject,kind:'preference',key:'format',value:'short',source:'model',evidenceId:'same'}});
  let finish;const pending=learner.extract({eventId:'same',text:'request'},()=>new Promise(resolve=>{finish=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));pm.rejectCandidate(prior.id,{expectedRevision:1});finish([item()]);
  await assert.rejects(pending,{code:'ERR_CANDIDATE_CONFLICT'});assert.equal(pm.getCandidate(prior.id).status,'rejected');
});
test('a deleted cached proposal is unavailable on retry and never reappears',async()=>{
  const {pm,learner}=setup();let calls=0;const extract=()=>{calls++;return [item()];};
  const input={eventId:'deleted',text:'request'},first=await learner.extract(input,extract);
  pm.deleteSubject(subject);const result=await learner.extract(input,extract);
  assert.deepEqual(result.candidates,[]);assert.deepEqual(result.unavailable,[first.candidates[0].id]);assert.equal(calls,1);
});
test('persistence failure retries the completed extraction without another external call',async()=>{
  const backing=new MemorySnapshotStore();let fail=true,calls=0;
  const store={read:()=>backing.read(),write:(snapshot,options)=>{if(fail)throw new Error('disk offline');return backing.write(snapshot,options);}};
  const pm=await PersonaMemory.open({store,clock:()=>1000}),learner=createMemoryLearner(pm,{subject});
  const input={text:'request',eventId:'persist'},extract=()=>{calls++;return [item()];};
  await assert.rejects(learner.extract(input,extract),/disk offline/);assert.equal(pm.diagnostics().candidates,1);
  fail=false;assert.equal((await learner.extract(input,extract)).candidates.length,1);assert.equal(calls,1);
  assert.equal((await PersonaMemory.open({store,clock:()=>1000})).diagnostics().candidates,1);
});
test('limited automatic acceptance is explicit and extraction cannot elevate verified experience',async()=>{
  const {pm,learner}=setup({source:'rule',autoAccept:{kinds:['preference'],minConfidence:0.8,maxPerCall:1}});
  const result=await learner.extract({eventId:'rule',text:'request'},()=>[item()]);
  assert.equal(result.accepted.length,1);const record=pm.getMemory(result.accepted[0]);assert.equal(record.source,'rule');assert.equal(record.experience,undefined);
});
test('empty results, excessive arrays and invalid event input have explicit bounded outcomes',async()=>{
  const {pm,learner}=setup({maxCandidatesPerCall:1});assert.deepEqual((await learner.extract({eventId:'none',text:'no evidence'},()=>[])).candidates,[]);
  await assert.rejects(learner.extract({eventId:'many',text:'request'},()=>[item(),item()]));assert.equal(pm.diagnostics().candidates,0);
  let calls=0;await assert.rejects(learner.extract({eventId:'__proto__',text:'request'},()=>{calls++;return [];}));assert.equal(calls,0);
});
