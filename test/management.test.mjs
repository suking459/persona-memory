import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PersonaMemory,MemorySnapshotStore,previewCandidateReview,applyCandidateReview,previewMemoryForget,applyMemoryForget} from '../src/index.js';
import {prepareAgentBundle,openAgentMemory,createAgentSession} from '../adapters/agent/index.js';
import {connectCommand} from '../tools/connect.mjs';
const subject={type:'project',id:'p'},other={type:'project',id:'other'},base=fileURLToPath(new URL('../.artifacts/',import.meta.url));
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'manage-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function candidate(pm,key='language',value='中文',extra={}){
  return pm.proposeMemory({memory:{subject,kind:'fact',key,value,evidenceId:key+'-'+value,...extra},reason:'synthetic request'});
}
const req=c=>({id:c.id,expectedRevision:c.revision});
test('batch preview is pure; acceptance persists all proposals atomically without claiming evidence verification',async()=>{
  const pm=await PersonaMemory.open({store:new MemorySnapshotStore()}),a=candidate(pm),b=candidate(pm,'theme','dark');await pm.persist();const before=pm.export();
  const plan=await previewCandidateReview(pm,{subject,requests:[req(a),req(b)],decision:'accept'});
  assert.equal(plan.allowed,true);assert.equal(plan.evidenceVerified,false);assert.equal(plan.rows[0].proposedValue,'中文');assert.deepEqual(pm.export(),before);
  const result=await applyCandidateReview(pm,plan);assert.equal(result.reviewed,2);assert.equal(pm._dirty,false);assert.equal(result.requiresReload,false);
  assert.equal((await PersonaMemory.open({store:pm._store})).listMemories({subject}).length,2);
});
test('two proposals competing for one field cannot be partially accepted',async()=>{
  const pm=new PersonaMemory(),a=candidate(pm),b=candidate(pm,'language','English'),before=pm.export();
  const plan=await previewCandidateReview(pm,{subject,requests:[req(a),req(b)],decision:'accept'});
  assert.equal(plan.allowed,false);await assert.rejects(applyCandidateReview(pm,plan),{code:'ERR_REVIEW_PRECONDITION'});assert.deepEqual(pm.export(),before);
});
test('batch rejection handles multiple proposals atomically and preserves formal memory',async()=>{
  const pm=new PersonaMemory(),a=candidate(pm),b=candidate(pm,'language','English');
  const plan=await previewCandidateReview(pm,{subject,requests:[req(a),req(b)],decision:'reject',reason:'unconfirmed'});
  assert.equal(plan.allowed,true);await applyCandidateReview(pm,plan);
  assert.equal(pm.getCandidate(a.id).status,'rejected');assert.equal(pm.getCandidate(b.id).decisionReason,'unconfirmed');assert.equal(pm.diagnostics().memories,0);
});
test('a changed candidate or newly written unrelated field invalidates the full owner preview',async()=>{
  const pm=new PersonaMemory(),a=candidate(pm),plan=await previewCandidateReview(pm,{subject,requests:[req(a)],decision:'accept'});
  candidate(pm,'other','new');const before=pm.export();await assert.rejects(applyCandidateReview(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});assert.deepEqual(pm.export(),before);
});
test('expired candidate batches explain refusal and cannot be applied later',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=candidate(pm);now+=73*3600000;
  const plan=await previewCandidateReview(pm,{subject,requests:[req(a)],decision:'accept'});assert.equal(plan.allowed,false);assert.equal(pm.getCandidate(a.id,{includeExpired:true}).status,'pending');
});
test('foreign subjects, duplicate requests, accessors and excessive batches fail without invoking callbacks',async()=>{
  const pm=new PersonaMemory(),a=candidate(pm);let calls=0;
  for(const requests of [[req(a),req(a)],Array.from({length:33},()=>req(a)),[{get id(){calls++;return a.id;},expectedRevision:1}]])await assert.rejects(previewCandidateReview(pm,{subject,requests,decision:'accept'}));
  await assert.rejects(previewCandidateReview(pm,{subject:other,requests:[req(a)],decision:'accept'}),/unavailable/);assert.equal(calls,0);
});
test('owner plans reject checksum edits, different core identity, expired time and changed config',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=candidate(pm),plan=await previewCandidateReview(pm,{subject,requests:[req(a)],decision:'accept'});
  await assert.rejects(applyCandidateReview(pm,{...plan,decision:'reject'}),/invalid management/);
  await assert.rejects(applyCandidateReview(new PersonaMemory({scope:'other',clock:()=>now}),plan),{code:'ERR_MANAGEMENT_CHANGED'});
  now+=600000;await assert.rejects(applyCandidateReview(pm,plan),{code:'ERR_MANAGEMENT_EXPIRED'});now=1000;pm.config.historyLimit=99;
  await assert.rejects(applyCandidateReview(pm,plan),{code:'ERR_MANAGEMENT_CHANGED'});
});
test('failed managed persistence preserves all live candidate states',async()=>{
  const backing=new MemorySnapshotStore();let offline=false;
  const store={read:()=>backing.read(),async write(s,o){if(offline)throw new Error('offline');return backing.write(s,o);}};
  const pm=await PersonaMemory.open({store}),a=candidate(pm),b=candidate(pm,'theme','dark');await pm.persist();
  const plan=await previewCandidateReview(pm,{subject,requests:[req(a),req(b)],decision:'accept'}),before=pm.export();offline=true;
  await assert.rejects(applyCandidateReview(pm,plan),/offline/);assert.deepEqual(pm.export(),before);assert.equal(pm._dirty,false);
});
test('forget preview counts transitive histories and candidates while excluding a peer subject',async()=>{
  const pm=new PersonaMemory(),a=pm.putMemory({id:'a',subject,kind:'fact',key:'a',value:'one'}),b=pm.putMemory({id:'b',subject,kind:'fact',key:'b',value:'derived',derivedFrom:[req(a)].map(r=>({id:r.id,revision:r.expectedRevision}))});
  candidate(pm,'c','pending',{derivedFrom:[{id:b.id,revision:b.revision}]});pm.putMemory({id:'private',subject:other,kind:'fact',key:'x',value:'private'});
  const before=pm.export(),plan=await previewMemoryForget(pm,{subject,id:a.id,expectedRevision:1});
  assert.equal(plan.impact.memories,2);assert.equal(plan.impact.candidates,1);assert.deepEqual(pm.export(),before);
  const result=await applyMemoryForget(pm,plan);assert.equal(result.removed,3);assert.equal(pm.getMemory('b'),null);assert.ok(pm.getMemory('private'));
});
test('forget preview samples stay bounded for large cascades and expired heads remain erasable',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=pm.putMemory({id:'a',subject,kind:'fact',key:'a',value:'one',expiresAt:2000});
  for(let i=0;i<20;i++)pm.putMemory({id:'d'+i,subject,kind:'fact',key:'d'+i,value:'derived',derivedFrom:[{id:a.id,revision:1}]});
  now=3000;const plan=await previewMemoryForget(pm,{subject,id:'a',expectedRevision:1});
  assert.equal(plan.impact.memories,21);assert.equal(plan.impact.recordIds.length,16);assert.equal(plan.impact.truncated,true);await applyMemoryForget(pm,plan);assert.equal(pm.diagnostics().memories,0);
});
test('CLI preview/apply binds physical storage and reloads reviewed state from a new process view',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'dsh',out:path.join(dir,'bundle'),project:dir}),file=path.join(bundle.directory,'binding.json'),pm=openAgentMemory(bundle.binding);
  const a=pm.proposeMemory({memory:{subject:bundle.binding.subjects.project,kind:'fact',key:'language',value:'中文',evidenceId:'t'}});pm.flush();
  const requests=path.join(dir,'requests.json'),plan=path.join(dir,'plan.json');fs.writeFileSync(requests,JSON.stringify([req(a)]));
  const preview=await connectCommand(['review-preview','--binding',file,'--scope','project','--requests',requests,'--decision','accept','--out',plan]);assert.equal(preview.previewOnly,true);assert.equal(openAgentMemory(bundle.binding).diagnostics().memories,0);
  await connectCommand(['review-apply','--binding',file,'--plan',plan]);const record=openAgentMemory(bundle.binding).listMemories({subject:bundle.binding.subjects.project})[0];
  const forget=path.join(dir,'forget.json');await connectCommand(['forget-preview','--binding',file,'--scope','project','--memory',record.id,'--revision',String(record.revision),'--out',forget]);
  const changed=path.join(dir,'changed.json');fs.writeFileSync(changed,JSON.stringify({...bundle.binding,storage:path.join(dir,'elsewhere')}));
  await assert.rejects(connectCommand(['forget-apply','--binding',changed,'--plan',forget]),/different binding/);
  await connectCommand(['forget-apply','--binding',file,'--plan',forget]);assert.equal(openAgentMemory(bundle.binding).diagnostics().memories,0);
});
function agentSetup(t){
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,access:'review'}),binding=bundle.binding,pm=openAgentMemory(binding);
  return {pm,binding,session:createAgentSession(pm,binding)};
}
async function agentProposal(session){return (await session.call('memory_propose',{scope:'project',kind:'fact',key:'x',value:'one',evidenceId:'t',reason:'request'})).candidate;}
test('Agent batch plans are connection-owned, detached and require review access',async t=>{
  const {pm,binding,session}=agentSetup(t),a=await agentProposal(session),preview=await session.call('memory_review_preview',{scope:'project',decision:'accept',requests:[req(a)]});
  preview.rows[0].proposedValue='tampered';
  const second=createAgentSession(openAgentMemory(binding),binding);
  await assert.rejects(second.call('memory_review_batch',{scope:'project',previewId:preview.previewId}),{code:'ERR_MANAGEMENT_PREVIEW'});
  const capture=createAgentSession(pm,{...binding,access:'capture'});
  await assert.rejects(capture.call('memory_review_preview',{scope:'project',decision:'accept',requests:[req(a)]}),/not granted/);
  const applied=await session.call('memory_review_batch',{scope:'project',previewId:preview.previewId});assert.equal(applied.reviewed,1);assert.equal(pm.listMemories({subject:binding.subjects.project})[0].value,'one');
});
test('Agent deletion cannot execute without the same connection impact preview and rejects changed target',async t=>{
  const {pm,binding,session}=agentSetup(t),a=await agentProposal(session),accepted=await session.call('memory_review',{scope:'project',candidateId:a.id,expectedRevision:1,decision:'accept'}),args={scope:'project',id:accepted.record.id,expectedRevision:1};
  await assert.rejects(session.call('memory_forget',args),/missing previewId/);
  const preview=await session.call('memory_forget_preview',args),external=openAgentMemory(binding);external.putMemory({id:'other',subject:binding.subjects.project,kind:'fact',key:'other',value:'new'});external.flush();
  await assert.rejects(session.call('memory_forget',{...args,previewId:preview.previewId}),{code:'ERR_MANAGEMENT_CHANGED'});assert.ok(pm.getMemory(accepted.record.id));
  const fresh=await session.call('memory_forget_preview',args);await session.call('memory_forget',{...args,previewId:fresh.previewId});assert.equal(openAgentMemory(binding).getMemory(accepted.record.id),null);
});
test('Agent keeps its operation lock during awaited managed writes and disables after ambiguous failure',async t=>{
  const {pm,binding,session}=agentSetup(t),a=await agentProposal(session),preview=await session.call('memory_review_preview',{scope:'project',decision:'accept',requests:[req(a)]});
  const write=pm._store.write.bind(pm._store);let release,started;const ready=new Promise(r=>started=r);
  pm._store.write=async(s,o)=>{started();await new Promise(r=>release=r);return write(s,o);};
  const pending=session.call('memory_review_batch',{scope:'project',previewId:preview.previewId});await ready;
  await assert.rejects(session.call('memory_status'),{code:'ERR_AGENT_BUSY'});release();assert.equal((await pending).committed,true);
  const record=pm.listMemories({subject:binding.subjects.project})[0],f=await session.call('memory_forget_preview',{scope:'project',id:record.id,expectedRevision:record.revision});
  pm._store.write=async()=>{throw new Error('disk failure');};
  await assert.rejects(session.call('memory_forget',{scope:'project',id:record.id,expectedRevision:record.revision,previewId:f.previewId}),{code:'ERR_AGENT_STORE'});
  await assert.rejects(session.call('memory_status'),{code:'ERR_AGENT_UNAVAILABLE'});assert.ok(openAgentMemory(binding).getMemory(record.id));
});

test('Agent preview cache and expiry are bounded without a cleanup timer',async t=>{
  const {pm,session}=agentSetup(t),a=await agentProposal(session);let first;
  for(let i=0;i<17;i++){const p=await session.call('memory_review_preview',{scope:'project',decision:'accept',requests:[req(a)]});if(i===0)first=p.previewId;}
  await assert.rejects(session.call('memory_review_batch',{scope:'project',previewId:first}),{code:'ERR_MANAGEMENT_PREVIEW'});
  const preview=await session.call('memory_review_preview',{scope:'project',decision:'accept',requests:[req(a)]});
  pm.clock=()=>preview.expiresAt;await assert.rejects(session.call('memory_review_batch',{scope:'project',previewId:preview.previewId}),{code:'ERR_MANAGEMENT_EXPIRED'});
  assert.equal(pm.getCandidate(a.id,{includeExpired:true}).status,'pending');
});
test('an excessive multilingual review preview fails before any write; smaller batches return compact committed receipts',async t=>{
  const {pm,binding,session}=agentSetup(t),requests=[];
  for(let i=0;i<32;i++)requests.push(req(pm.proposeMemory({memory:{subject:binding.subjects.project,kind:'fact',key:'k'+i,value:'语'.repeat(5000),evidenceId:'t'+i}})));
  pm.flush();const before=fs.readFileSync(pm._store.file);
  await assert.rejects(session.call('memory_review_preview',{scope:'project',decision:'accept',requests}),/capacity|large|limit|budget/i);assert.deepEqual(fs.readFileSync(pm._store.file),before);
  const preview=await session.call('memory_review_preview',{scope:'project',decision:'accept',requests:requests.slice(0,8)});
  const result=await session.call('memory_review_batch',{scope:'project',previewId:preview.previewId});assert.equal(result.reviewed,8);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<10000);assert.equal(pm.listMemories({subject:binding.subjects.project}).length,8);
});

test('owner previews normalize record IDs and reject duplicate candidates after normalization',async()=>{
  const pm=new PersonaMemory(),a=candidate(pm);
  await assert.rejects(previewCandidateReview(pm,{subject,decision:'accept',requests:[req(a),{id:' '+a.id+' ',expectedRevision:1}]}),/duplicate/);
  const p=await previewCandidateReview(pm,{subject,decision:'accept',requests:[{id:' '+a.id+' ',expectedRevision:1}]});
  assert.equal(p.requests[0].id,a.id);const result=await applyCandidateReview(pm,p),recordId=result.results[0].recordId;
  const f=await previewMemoryForget(pm,{subject,id:' '+recordId+' ',expectedRevision:1});assert.equal(f.id,recordId);await applyMemoryForget(pm,f);
});
