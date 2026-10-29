import {performance} from 'node:perf_hooks';
import {createMemoryBridge} from '../adapters/memory/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createMemoryLearner} from '../adapters/learning/index.js';
const subject={type:'project',id:'audit'};
const proposal=(id='a')=>({id,memory:{subject,kind:'fact',key:id,value:id,evidenceId:'evidence-'+id}});
test('null candidate collections are rejected instead of silently normalized away',()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.proposeMemory(proposal());const bad=pm.export();bad.candidates=null;const before=pm.export();
  assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('single-candidate acceptance options cannot override the explicit target ID',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=pm.proposeMemory(proposal('a')),b=pm.proposeMemory(proposal('b')),before=pm.export();
  assert.throws(()=>pm.acceptCandidate(a.id,{id:b.id,expectedRevision:1}));assert.deepEqual(pm.export(),before);
});
test('import cannot extend a candidate beyond the hard 30-day review bound',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=pm.proposeMemory(proposal()),bad=pm.export(),before=pm.export();
  bad.candidates[a.id].expiresAt=a.createdAt+721*3600000;
  assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('accepted candidate references must agree with retained formal record content and review time',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=pm.proposeMemory(proposal()),accepted=pm.acceptCandidate(a.id,{expectedRevision:1}),bad=pm.export(),before=pm.export();
  bad.memories[accepted.record.id].value='forged unrelated value';
  assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});
test('zero candidate capacity/bytes can round-trip an empty snapshot without enabling proposals',()=>{
  const config={maxCandidates:0,maxCandidateBytes:0},pm=new PersonaMemory({config,clock:()=>1000}),copy=new PersonaMemory({config,clock:()=>1000});
  copy.import(pm.export());assert.deepEqual(copy.export(),pm.export());assert.throws(()=>copy.proposeMemory(proposal()),{code:'ERR_MEMORY_CAPACITY'});
});
test('candidate batch arrays reject accessors without invoking them',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),inputs=[];let reads=0;
  Object.defineProperty(inputs,'0',{enumerable:true,get(){reads++;return proposal();}});
  const before=pm.export();assert.throws(()=>pm.proposeMemories(inputs));assert.equal(reads,0);assert.deepEqual(pm.export(),before);
});
test('extractor output subjects are validated before comparison without invoking accessors',async()=>{
  const pm=new PersonaMemory({clock:()=>1000}),learner=createMemoryLearner(pm,{subject});let reads=0;
  const badSubject={get type(){reads++;return 'project';},id:'audit'};
  await assert.rejects(learner.extract({eventId:'getter',text:'data'},()=>[{subject:badSubject,kind:'fact',key:'a',value:'a'}]));
  assert.equal(reads,0);assert.equal(pm.diagnostics().candidates,0);
});
test('experience condition accessors cannot run while validating a report',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),conditions=[];let reads=0;
  Object.defineProperty(conditions,'0',{enumerable:true,get(){reads++;return 'local';}});
  const before=pm.export();assert.throws(()=>pm.recordExperience({subject,key:'method',task:'test',attempt:'replay',result:'passed',outcome:'success',conditions}));
  assert.equal(reads,0);assert.deepEqual(pm.export(),before);
});
test('reviewed state and stale candidate safety survive all bounded serialization stages',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=pm.proposeMemory(proposal());now=2000;
  pm.putMemory({subject,kind:'fact',key:'a',value:'host correction'});const before=pm.export(),copy=new PersonaMemory({clock:()=>now});copy.import(before);
  assert.throws(()=>copy.acceptCandidate(a.id,{expectedRevision:1}),{code:'ERR_CANDIDATE_CONFLICT'});assert.deepEqual(copy.export(),before);
});

test('a synchronous slow extractor cannot finish successfully after its deadline before timers get a turn',async()=>{
  const pm=new PersonaMemory({clock:()=>1000}),learner=createMemoryLearner(pm,{subject,timeoutMs:10});
  await assert.rejects(learner.extract({eventId:'sync-slow',text:'data'},()=>{
    const until=performance.now()+35;while(performance.now()<until){};
    return [{subject,kind:'fact',key:'a',value:'late'}];
  }),{code:'ERR_TURN_TIMEOUT'});
  assert.equal(pm.diagnostics().candidates,0);
});
test('a synchronous slow model callback cannot acknowledge success just by blocking the timer',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'fact',key:'a',value:'current'});
  const bridge=createMemoryBridge(pm,{subject,budget:3000,timeoutMs:10});
  await assert.rejects(bridge.invoke({turnId:'sync-slow',text:'a'},()=>{
    const until=performance.now()+35;while(performance.now()<until){};return 'late';
  }),{code:'ERR_TURN_TIMEOUT'});
  assert.equal(pm.export().uses.length,0);
});
