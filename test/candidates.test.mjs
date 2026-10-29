import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
const subject={type:'project',id:'work'},other={type:'project',id:'other'};
const proposal=(extra={})=>({memory:{subject,kind:'constraint',key:'release',value:'after tests',source:'user',evidenceId:'message-1'},reason:'explicit request',confidence:0.9,...extra});
function setup(config={}){let now=1000;const pm=new PersonaMemory({clock:()=>now,config});return {pm,at:value=>{now=value;}};}
test('candidates stay out of formal retrieval, previews and social profiles until accepted',()=>{
  const {pm}=setup(),candidate=pm.proposeMemory(proposal());
  assert.equal(pm.searchMemories({subject}).matches.length,0);assert.equal(pm.buildMemoryContext({subject}).text,'');
  assert.equal(pm.diagnostics().profiles,0);assert.equal(pm.diagnostics().candidates,1);
  const accepted=pm.acceptCandidate(candidate.id,{expectedRevision:1});
  assert.equal(accepted.record.value,'after tests');assert.equal(accepted.record.source,'user');assert.equal(accepted.record.evidenceId,'message-1');
  assert.equal(pm.searchMemories({subject}).matches[0].record.id,accepted.record.id);
});
test('stable proposals and terminal review retries do not renew TTL or grow state',()=>{
  const {pm,at}=setup();const candidate=pm.proposeMemory(proposal()),before=pm.export();
  at(2000);assert.equal(pm.proposeMemory(proposal({reason:'different explanation',confidence:1,ttlHours:100})).id,candidate.id);
  assert.deepEqual(pm.export(),before);
  pm.rejectCandidate(candidate.id,{expectedRevision:1,reason:'not established'});const rejected=pm.export();
  assert.equal(pm.proposeMemory(proposal()).status,'rejected');
  pm.rejectCandidate(candidate.id,{expectedRevision:1,reason:'retry'});assert.deepEqual(pm.export(),rejected);
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:2}),{code:'ERR_CANDIDATE_CONFLICT'});
});
test('acceptance retries are pure and a reviewed ID cannot bind to different content',()=>{
  const {pm}=setup(),candidate=pm.proposeMemory(proposal()),accepted=pm.acceptCandidate(candidate.id,{expectedRevision:1}),before=pm.export();
  assert.equal(pm.acceptCandidate(candidate.id,{expectedRevision:1}).duplicate,true);assert.deepEqual(pm.export(),before);
  assert.throws(()=>pm.proposeMemory(proposal({id:candidate.id,memory:{...candidate.memory,value:'different'}})),{code:'ERR_CANDIDATE_CONFLICT'});
  assert.deepEqual(pm.export(),before);assert.ok(pm.getMemory(accepted.record.id));
});
test('candidate corrections retain their original formal precondition and review deadline',()=>{
  const {pm,at}=setup();const candidate=pm.proposeMemory(proposal());at(2000);
  const corrected=pm.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'after all checks',evidenceId:'human-correction',observedAt:2000},reason:'corrected'});
  assert.equal(corrected.revision,2);assert.equal(corrected.expiresAt,candidate.expiresAt);assert.deepEqual(corrected.base,candidate.base);
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:1}),{code:'ERR_CANDIDATE_CONFLICT'});
  const accepted=pm.acceptCandidate(candidate.id,{expectedRevision:2});assert.equal(accepted.record.value,'after all checks');
  const restored=new PersonaMemory({clock:()=>2000});restored.import(pm.export());assert.deepEqual(restored.export(),pm.export());
});
test('a later formal correction cannot be overwritten by an old candidate, even after revising it',()=>{
  const {pm,at}=setup();const old=pm.putMemory({subject,kind:'constraint',key:'release',value:'initial'});
  const candidate=pm.proposeMemory(proposal());at(2000);
  pm.putMemory({subject,kind:'constraint',key:'release',value:'host correction',replaceId:old.id});
  const revised=pm.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'another guess'}}),before=pm.export();
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:revised.revision}),{code:'ERR_CANDIDATE_CONFLICT'});
  assert.deepEqual(pm.export(),before);assert.equal(pm.listMemories({subject})[0].value,'host correction');
});
test('candidate preconditions remain valid after serialization and reload',()=>{
  const {pm,at}=setup();pm.putMemory({subject,kind:'constraint',key:'release',value:'initial'});
  const candidate=pm.proposeMemory(proposal());const restored=new PersonaMemory({clock:()=>2000});restored.import(pm.export());
  assert.equal(restored.acceptCandidate(candidate.id,{expectedRevision:1}).record.revision,2);at(2000);
});
test('candidate batch validation and formal capacity failures leave no partial changes',()=>{
  const {pm}=setup({maxMemories:1});const a=pm.proposeMemory(proposal());
  const b=pm.proposeMemory(proposal({memory:{...a.memory,key:'second',evidenceId:'message-2'}}));
  const before=pm.export();assert.throws(()=>pm.acceptCandidates([{id:a.id,expectedRevision:1},{id:b.id,expectedRevision:1}]),{code:'ERR_MEMORY_CAPACITY'});assert.deepEqual(pm.export(),before);
  assert.throws(()=>pm.proposeMemories([proposal(),proposal({memory:{...a.memory,subject:other,value:()=>{}}})]));assert.deepEqual(pm.export(),before);
});
test('two conflicting candidate values for one field cannot both be accepted in a single batch',()=>{
  const {pm}=setup(),a=pm.proposeMemory(proposal()),b=pm.proposeMemory(proposal({memory:{...a.memory,value:'other',evidenceId:'message-2'}}));
  const before=pm.export();assert.throws(()=>pm.acceptCandidates([{id:a.id,expectedRevision:1},{id:b.id,expectedRevision:1}]),{code:'ERR_CANDIDATE_CONFLICT'});assert.deepEqual(pm.export(),before);
});
test('pending and reviewed candidates expire without renewing old evidence or formal memory',()=>{
  const {pm,at}=setup({candidateTtlHours:1});const candidate=pm.proposeMemory(proposal());at(candidate.expiresAt);
  assert.equal(pm.getCandidate(candidate.id),null);assert.equal(pm.listCandidates({subject}).length,0);
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:1}),{code:'ERR_CANDIDATE_CONFLICT'});
  assert.equal(pm.maintain().candidatesExpired,1);assert.equal(pm.diagnostics().candidates,0);
});
test('temporary candidate evidence cannot remain reviewable beyond its memory TTL',()=>{
  const {pm,at}=setup({stateMemoryTtlHours:1,candidateTtlHours:72});
  const candidate=pm.proposeMemory(proposal({memory:{subject,kind:'state',key:'mood',value:'tired',evidenceId:'state'}}));
  assert.equal(candidate.expiresAt,candidate.memory.expiresAt);at(candidate.expiresAt);
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:1}),{code:'ERR_CANDIDATE_CONFLICT'});
});
test('subject/user deletion removes candidate values and forget removes accepted-slot proposals',()=>{
  const {pm}=setup(),a=pm.proposeMemory(proposal()),accepted=pm.acceptCandidate(a.id,{expectedRevision:1});
  pm.proposeMemory(proposal({memory:{...a.memory,value:'unreviewed secret',evidenceId:'pending'}}));
  pm.proposeMemory(proposal({memory:{...a.memory,subject:other,evidenceId:'other'}}));
  pm.forgetMemory(accepted.record.id);assert.equal(pm.listCandidates({subject}).length,0);
  assert.equal(pm.listCandidates({subject:other}).length,1);assert.ok(!JSON.stringify(pm.export()).includes('unreviewed secret'));
  const user={type:'user',id:'u',chatId:'r'};pm.proposeMemory(proposal({memory:{...a.memory,subject:user}}));pm.deleteUser('u',{chatId:'r'});
  assert.equal(pm.listCandidates({subject:user}).length,0);pm.deleteSubject(other);assert.equal(pm.diagnostics().candidates,0);
});
test('candidate capacity counts reviewed rows and byte limits reject atomically',()=>{
  const {pm}=setup({maxCandidates:1});const a=pm.proposeMemory(proposal());pm.rejectCandidate(a.id,{expectedRevision:1});
  const before=pm.export();assert.throws(()=>pm.proposeMemory(proposal({memory:{...a.memory,evidenceId:'other'}})),{code:'ERR_MEMORY_CAPACITY'});assert.deepEqual(pm.export(),before);
  const tiny=setup({maxCandidateBytes:300}).pm;assert.throws(()=>tiny.proposeMemory(proposal()),{code:'ERR_MEMORY_CAPACITY'});assert.equal(tiny.diagnostics().candidates,0);
});
test('explicit automatic acceptance is limited to allowed new fields and bounded confidence policy',()=>{
  const {pm}=setup();pm.putMemory({subject,kind:'constraint',key:'release',value:'host value'});
  const inputs=[proposal(),proposal({memory:{subject,kind:'preference',key:'format',value:'short',evidenceId:'m2'},confidence:0.5}),
    proposal({memory:{subject,kind:'fact',key:'language',value:'Chinese',evidenceId:'m3'}})];
  const result=pm.proposeMemories(inputs,{autoAccept:{kinds:['fact','constraint','preference'],minConfidence:0.8,maxPerCall:1}});
  assert.equal(result.accepted.length,1);assert.deepEqual(result.omitted.map(row=>row.reason),['existing-slot','confidence']);
  assert.equal(pm.listMemories({subject,kind:'constraint'})[0].value,'host value');
});
test('automatic acceptance failure is atomic across proposals and formal records',()=>{
  const {pm}=setup({maxMemories:0}),before=pm.export();
  assert.throws(()=>pm.proposeMemories([proposal()],{autoAccept:{kinds:['constraint'],minConfidence:0.8,maxPerCall:1}}),{code:'ERR_MEMORY_CAPACITY'});
  assert.deepEqual(pm.export(),before);
});
