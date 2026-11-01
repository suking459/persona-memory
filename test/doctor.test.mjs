import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PersonaMemory,diagnoseMemory,explainMemoryRecall} from '../src/index.js';
import {prepareAgentBundle,openAgentMemory,createAgentSession,doctorAgent} from '../adapters/agent/index.js';
import {connectCommand} from '../tools/connect.mjs';
const base=fileURLToPath(new URL('../.artifacts/',import.meta.url)),subject={type:'project',id:'p'},privateSubject={type:'user',id:'secret'};
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'doctor-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const fact=(pm,id,value='approved',extra={})=>pm.putMemory({id,subject,kind:'fact',key:id,value,...extra});
test('doctor inspects stale dependencies and expired proposals without modifying data or pending contexts',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),source=fact(pm,'source'),derived=fact(pm,'derived','summary',{derivedFrom:[{id:source.id,revision:1}]});
  pm.proposeMemory({memory:{subject,kind:'fact',key:'pending',value:'draft',evidenceId:'t'},ttlHours:0});
  now=2000;fact(pm,'new','corrected',{key:'source',replaceId:source.id});const context=pm.buildMemoryContext({subject,budget:5000}),before=pm.export(),epoch=pm._recordEpoch;
  const report=diagnoseMemory(pm,{subjects:[subject]});assert.equal(report.ok,true);assert.equal(report.counts.expiredPending,1);assert.ok(report.sourceCheck.samples.some(r=>r.id===derived.id));
  assert.deepEqual(pm.export(),before);assert.equal(pm._recordEpoch,epoch);assert.ok(pm._pending.has(context.contextId));assert.equal(report.externalServicesContacted,false);assert.equal(report.repairsApplied,false);
});
test('doctor record inspection is bounded and scope-filtered; it does not expose memory bodies',()=>{
  const pm=new PersonaMemory();fact(pm,'a');fact(pm,'b');fact(pm,'private','DO_NOT_EXPOSE',{subject:privateSubject});
  const report=diagnoseMemory(pm,{subjects:[subject],maxRecords:1});assert.equal(report.counts.records,2);assert.equal(report.sourceCheck.inspected,1);assert.equal(report.sourceCheck.truncated,true);assert.equal(JSON.stringify(report).includes('DO_NOT_EXPOSE'),false);
});
test('doctor rejects getters and malformed options without invoking them',()=>{
  const pm=new PersonaMemory();let calls=0;
  assert.throws(()=>diagnoseMemory(pm,{get subjects(){calls++;return [subject];}}));
  for(const options of [{subjects:[]},{subjects:{}},{maxRecords:1001},{extra:true}])assert.throws(()=>diagnoseMemory(pm,options));assert.equal(calls,0);
});
test('Agent doctor does not create a missing store or contact a configured embedding endpoint',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'workbuddy',out:path.join(dir,'bundle'),project:dir,retrieval:{provider:'ollama',endpoint:'http://127.0.0.1:1/api/embed',model:'not-contacted'}});
  const fetch=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw new Error('network forbidden');};t.after(()=>{globalThis.fetch=fetch;});
  const report=doctorAgent(bundle.binding);assert.equal(report.ok,true);assert.equal(report.retrieval.contacted,false);assert.equal(fs.existsSync(bundle.binding.storage),false);
  const cli=await connectCommand(['doctor','--binding',path.join(bundle.directory,'binding.json')]);assert.equal(cli.ok,true);assert.equal(calls,0);
});
test('doctor reports unreadable/corrupt snapshots without exposing their text or changing bytes',t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir}),pm=openAgentMemory(bundle.binding);fact(pm,'a');pm.flush();
  const file=pm._store.file,data=Buffer.from('{CORRUPT_PRIVATE_DATA');fs.writeFileSync(file,data);
  const report=doctorAgent(bundle.binding);assert.equal(report.ok,false);assert.equal(report.checks[0].code,'ERR_STORE_INVALID');assert.equal(JSON.stringify(report).includes('CORRUPT_PRIVATE_DATA'),false);assert.deepEqual(fs.readFileSync(file),data);
});
test('explanation reports lexical reasons and original source text while distinguishing confidence',()=>{
  const pm=new PersonaMemory();fact(pm,'language','日本語',{source:'user',assertion:'explicit'});
  const result=explainMemoryRecall(pm,{subject,query:'language',id:'language',locale:'ja',limit:3});
  assert.equal(result.mode,'local-lexical-diagnostic');assert.equal(result.inspected.selected,true);assert.equal(result.semanticConsulted,false);
  assert.ok(result.result.matches[0].reasons.includes('exact-key'));assert.equal(result.explanation.scoreIsConfidence,false);assert.equal(result.result.matches[0].record.value,'日本語');assert.equal(result.explanation.budgets.resultLimit,3);
});
test('foreign and missing explanation IDs share the same unavailable result and cannot leak data',()=>{
  const pm=new PersonaMemory();fact(pm,'private-id','PRIVATE_VALUE',{subject:privateSubject});
  const a=explainMemoryRecall(pm,{subject,query:'PRIVATE_VALUE',id:'private-id'}),b=explainMemoryRecall(pm,{subject,query:'PRIVATE_VALUE',id:'not-present'});
  assert.deepEqual(a.inspected,b.inspected);assert.equal(a.result.matches.length,0);assert.equal(JSON.stringify(a.inspected).includes('private-id'),false);
});
test('expired and nonmatching in-scope records receive conservative explicit explanations',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now});fact(pm,'temporary','value',{expiresAt:2000});fact(pm,'unrelated');
  now=3000;const expired=explainMemoryRecall(pm,{subject,query:'temporary',id:'temporary'});assert.equal(expired.inspected.selected,false);assert.equal(expired.inspected.validity.usable,false);
  const miss=explainMemoryRecall(pm,{subject,query:'nonmatching',id:'unrelated'});assert.equal(miss.inspected.reason,'not-selected-within-search-budgets');
});
test('read-only Agent tools remain scoped even with semantic configuration',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'dsh',out:path.join(dir,'bundle'),project:dir,access:'read',retrieval:{provider:'ollama',endpoint:'http://127.0.0.1:1/api/embed',model:'not-contacted'}}),pm=openAgentMemory(bundle.binding);
  pm.putMemory({id:'a',subject:bundle.binding.subjects.project,kind:'fact',key:'language',value:'English'});pm.flush();const before=fs.readFileSync(pm._store.file),session=createAgentSession(pm,bundle.binding);
  assert.equal((await session.call('memory_doctor',{scope:'project'})).counts.records,1);
  assert.equal((await session.call('memory_explain',{scope:'project',query:'language'})).semanticConsulted,false);
  await assert.rejects(session.call('memory_doctor',{scope:'foreign'}),/not granted/);assert.deepEqual(fs.readFileSync(pm._store.file),before);
});
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||major===22&&minor<13){
  test('doctor clearly reports optional SQLite unavailability on an old runtime without creating data',t=>{
    const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,backend:'sqlite'}),report=doctorAgent(bundle.binding);
    assert.equal(report.ok,false);assert.equal(report.checks[0].code,'ERR_SQLITE_UNAVAILABLE');assert.equal(fs.existsSync(bundle.binding.storage),false);
  });
}else{
  test('doctor opens actual SQLite read-only and leaves the database byte-for-byte unchanged',t=>{
    const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,backend:'sqlite'}),pm=openAgentMemory(bundle.binding);fact(pm,'a');pm.flush();
    const before=fs.readFileSync(pm._store.file),report=doctorAgent(bundle.binding);assert.equal(report.ok,true);assert.equal(report.backend,'sqlite');assert.deepEqual(fs.readFileSync(pm._store.file),before);
  });
}

test('recall explanations normalize record IDs before checking selection',()=>{
  const pm=new PersonaMemory();fact(pm,'language','English');
  const explained=explainMemoryRecall(pm,{subject,query:'language',id:'  language  '});
  assert.equal(explained.inspected.id,'language');assert.equal(explained.inspected.selected,true);
});
