import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {prepareAgentBundle,createAgentSession,inspectAgentCandidates} from '../adapters/agent/index.js';
const subject={type:'project',id:'work'},other={type:'project',id:'other'};
const proposal=(pm,id,value,extra={})=>pm.proposeMemory({id,memory:{subject,kind:'preference',key:'language',value,evidenceId:'source-'+id,...extra}});
function directory(t){const base=fileURLToPath(new URL('../.artifacts/',import.meta.url));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'quality-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}

test('quality hints distinguish exact same-value and competing same-field proposals without auto-merging',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a',{b:2,a:1}),b=proposal(pm,'b',{a:1,b:2}),c=proposal(pm,'c','日本語');
  proposal(pm,'peer','private',{subject:other});proposal(pm,'different-kind','value',{kind:'fact'});proposal(pm,'different-key','value',{key:'other'});
  const before=pm.export(),quality=pm.inspectCandidate(a.id);
  assert.deepEqual(quality.similar.map(x=>x.id),[b.id]);assert.deepEqual(quality.competing.map(x=>x.id),[c.id]);
  assert.ok(quality.warnings.includes('same-value-proposals'));assert.ok(quality.warnings.includes('competing-values'));
  assert.equal(quality.evidenceVerified,false);assert.deepEqual(pm.export(),before);assert.equal(pm.searchMemories({subject}).matches.length,0);
});

test('bounded hints count omitted peers without exposing their values',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a','English');
  for(let i=0;i<6;i++)proposal(pm,'same'+i,'English');
  const result=pm.inspectCandidate(a.id,{limit:2});assert.equal(result.similar.length,2);assert.equal(result.similarCount,6);assert.equal(result.truncated,true);
  assert.equal(JSON.stringify(result.similar).includes('English'),false);
});

test('current-value hints retain original source and assertion instead of inventing authority',()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'preference',key:'language',value:'English',source:'user',assertion:'explicit'});
  const same=proposal(pm,'same','English',{source:'model',assertion:'inferred'}),different=proposal(pm,'different','বাংলা');
  const quality=pm.inspectCandidate(same.id);assert.equal(quality.current.relation,'same-value');assert.equal(quality.current.source,'user');assert.equal(quality.current.assertion,'explicit');
  assert.ok(quality.warnings.includes('inference-needs-review'));assert.equal(pm.inspectCandidate(different.id).current.relation,'different-value');
  assert.equal(pm.listMemories({subject})[0].value,'English');
});

test('expired and reviewed proposals are distinct from actionable pending values',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=proposal(pm,'a','English'),b=proposal(pm,'b','French');
  pm.rejectCandidate(b.id,{expectedRevision:1});assert.equal(pm.inspectCandidate(a.id).competingCount,0);
  assert.ok(pm.inspectCandidate(b.id).warnings.includes('already-reviewed'));now=1000+73*3600000;assert.ok(pm.inspectCandidate(a.id).warnings.includes('expired'));
});

test('assertion labels survive accept and restore but are not independent evidence verification',()=>{
  for(const assertion of ['explicit','observed','inferred','external']){
    const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a','قهوة',{assertion,source:'model'}),approved=pm.acceptCandidate(a.id,{expectedRevision:1});
    assert.equal(approved.record.assertion,assertion);assert.equal(approved.record.source,'model');
    const copy=new PersonaMemory({clock:()=>1000});copy.import(pm.export());assert.equal(copy.getMemory(approved.record.id).assertion,assertion);
    assert.equal(copy.inspectCandidate(a.id).evidenceVerified,false);
    if(assertion==='external')assert.ok(copy.inspectCandidate(a.id).warnings.includes('external-report-not-verified'));
  }
});

test('invalid candidate scalar fields never execute nested toJSON or getters during identity hashing',()=>{
  let calls=0;const pm=new PersonaMemory({clock:()=>1000});
  for(const field of ['kind','source','assertion'])for(const type of ['toJSON','getter']){
    const trap=type==='toJSON'?{toJSON(){calls++;return 'fact';}}:Object.defineProperty({},'nested',{enumerable:true,get(){calls++;return 'value';}});
    const before=pm.export();assert.throws(()=>proposal(pm,'bad','value',{[field]:trap}));assert.deepEqual(pm.export(),before);
  }
  assert.equal(calls,0);
});

test('invalid assertion and quality options fail without state changes or getter calls',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a','English');const before=pm.export();
  for(const assertion of [null,'verified','',[],{}])assert.throws(()=>proposal(pm,'bad','value',{assertion}));
  for(const limit of [0,33,null,1.5,Infinity])assert.throws(()=>pm.inspectCandidate(a.id,{limit}));
  let calls=0;const options=Object.defineProperty({},'limit',{enumerable:true,get(){calls++;return 1;}});
  assert.throws(()=>pm.inspectCandidate(a.id,options));assert.equal(calls,0);assert.deepEqual(pm.export(),before);
});

test('changing an assertion requires a new proposal identity or a reviewed candidate revision',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a','English',{assertion:'inferred'});
  assert.throws(()=>proposal(pm,'a','English',{assertion:'explicit'}),/different content/);
  const revised=pm.reviseCandidate(a.id,{expectedRevision:1,memory:{assertion:'explicit'}});
  assert.throws(()=>pm.acceptCandidate(a.id,{expectedRevision:1}),/revised/);assert.equal(pm.acceptCandidate(a.id,{expectedRevision:revised.revision}).record.assertion,'explicit');
});

test('portable v2 preserves assertion labels across an explicit subject migration',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),target=new PersonaMemory({clock:()=>1000});
  pm.putMemory({subject,kind:'fact',key:'claim',value:'नमस्ते',source:'model',assertion:'inferred',evidenceId:'task'});
  const bundle=pm.exportMemories({subject});assert.equal(bundle.version,2);assert.equal(bundle.records[0].assertion,'inferred');
  const plan=target.previewMemoryImport(bundle,{mappings:[{from:subject,to:other}]});target.applyMemoryImport(plan.planId);
  assert.equal(target.listMemories({subject:other})[0].assertion,'inferred');
  assert.equal(target.listMemories({subject:other})[0].source,'model');
});

test('portable v1 cannot smuggle assertion metadata and plain old exports retain version 1',()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'fact',key:'plain',value:'plain'});
  const bundle=pm.exportMemories({subject});assert.equal(bundle.version,1);bundle.records[0].assertion='external';
  const target=new PersonaMemory({clock:()=>1000}),before=target.export();
  assert.throws(()=>target.previewMemoryImport(bundle,{mappings:[{from:subject,to:other}]}),/version 2/);assert.deepEqual(target.export(),before);
});

test('old schema snapshots cannot mislabel new assertion metadata',()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'fact',key:'claim',value:'claim',assertion:'observed'});
  const snapshot=pm.export();snapshot.schemaVersion=5;const target=new PersonaMemory({clock:()=>1000}),before=target.export();
  assert.throws(()=>target.import(snapshot),/schemaVersion=6/);assert.deepEqual(target.export(),before);
});

test('quality hints report same-revision source-content changes in a saved derived candidate',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),source=pm.putMemory({id:'source',subject,kind:'fact',key:'source',value:'first'});
  const candidate=proposal(pm,'derived','summary',{derivedFrom:[{id:source.id,revision:source.revision}]});
  const snapshot=pm.export();snapshot.memories.source.value='changed';const copy=new PersonaMemory({clock:()=>1000});copy.import(snapshot);
  assert.deepEqual(copy.inspectCandidate(candidate.id).sourceChanges,['source']);assert.ok(copy.inspectCandidate(candidate.id).warnings.includes('sources-unavailable'));
});

test('high model confidence and external labels never bypass the Agent capture review boundary',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir});
  const binding=bundle.binding,pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace}),session=createAgentSession(pm,binding);
  const data={scope:'project',kind:'fact',key:'claim',value:'claim',evidenceId:'source',reason:'external report',confidence:1,assertion:'external'};
  const result=await session.call('memory_propose',data);assert.equal(result.approved,false);assert.equal(result.candidate.memory.source,'model');assert.equal(result.quality.evidenceVerified,false);
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);assert.ok(!session.tools.some(x=>x.name==='memory_review'));
  const inspected=inspectAgentCandidates(binding,{scope:'project',candidateId:result.candidate.id});assert.ok(inspected.quality.warnings.includes('external-report-not-verified'));
});

test('omitted Agent assertions default conservatively to inference, with invalid null rejected',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'workbuddy',out:path.join(dir,'bundle'),project:dir});
  const binding=bundle.binding,pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace}),session=createAgentSession(pm,binding);
  const raw={scope:'project',kind:'fact',key:'claim',value:'claim',evidenceId:'source',reason:'context'};
  const result=await session.call('memory_propose',raw);assert.equal(result.candidate.memory.assertion,'inferred');assert.ok(result.quality.warnings.includes('inference-needs-review'));
  await assert.rejects(session.call('memory_propose',{...raw,evidenceId:'null-source',assertion:null}),/assertion/);
});

test('quality hints do not pretend different keys or translations are semantic contradictions',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=proposal(pm,'a','coffee',{key:'drink'});
  proposal(pm,'b','café',{key:'饮料'});const report=pm.inspectCandidate(a.id);assert.equal(report.competingCount,0);assert.match(report.limits,/not semantic contradiction/);
});

test('host extraction forwards bounded source references and assertion labels without accepting them',async()=>{
  const {createMemoryLearner}=await import('../adapters/learning/index.js');
  const pm=new PersonaMemory({clock:()=>1000}),original=pm.putMemory({id:'source',subject,kind:'fact',key:'source',value:'original'});
  const learner=createMemoryLearner(pm,{subject});
  const result=await learner.extract({eventId:'actual-event',text:'synthetic report'},()=>[{subject,kind:'fact',key:'summary',value:'summary',assertion:'inferred',derivedFrom:[{id:original.id,revision:original.revision}]}]);
  assert.equal(result.candidates[0].memory.assertion,'inferred');assert.equal(result.candidates[0].memory.evidenceId,'actual-event');assert.equal(result.candidates[0].memory.derivedFrom[0].id,original.id);
  assert.equal(pm.searchMemories({subject,query:'summary'}).matches.length,0);
});
test('host extraction cannot use declared references to read or cite another subject',async()=>{
  const {createMemoryLearner}=await import('../adapters/learning/index.js');
  const pm=new PersonaMemory({clock:()=>1000}),privateRecord=pm.putMemory({subject:other,kind:'fact',key:'private',value:'private'});
  const learner=createMemoryLearner(pm,{subject}),before=pm.export();
  await assert.rejects(learner.extract({eventId:'private-attempt',text:'synthetic'},()=>[{subject,kind:'fact',key:'summary',value:'summary',derivedFrom:[{id:privateRecord.id,revision:privateRecord.revision}]}]),/same subject/);
  assert.deepEqual(pm.export(),before);
});
