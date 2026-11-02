import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {PersonaMemory} from '../src/index.js';
import {createSemanticRetriever} from '../adapters/semantic/index.js';
const subject={type:'project',id:'work'},peer={type:'project',id:'private'};
const put=(pm,id,value,extra={})=>pm.putMemory({id,subject,kind:'fact',key:id,value,...extra});
const vectors=({texts})=>texts.map(text=>/coffee|咖啡|café|قهوة|कॉफ़ी/i.test(text)?[1,0]:[0,1]);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('semantic fixtures connect translated queries to approved memory while preserving original values and scope',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','I prefer coffee.');put(pm,'tea','I prefer tea.');put(pm,'private','coffee PRIVATE',{subject:peer});
  pm.proposeMemory({memory:{subject,kind:'fact',key:'pending',value:'coffee PENDING',evidenceId:'message'}});
  let seen;const retriever=createSemanticRetriever(pm,{subject,embed:input=>{seen=input;return vectors(input);}});
  const before=pm.export(),result=await retriever.search({query:'咖啡',locale:'zh-CN'});
  assert.equal(result.matches[0].record.id,'coffee');assert.equal(result.matches[0].method,'external');assert.equal(result.semantic.mode,'hybrid');
  assert.equal(result.matches[0].record.value,'I prefer coffee.');assert.equal(seen.texts.join('').includes('PRIVATE'),false);assert.equal(seen.texts.join('').includes('PENDING'),false);assert.deepEqual(pm.export(),before);
});
test('empty queries and no approved candidates never call an embedding provider',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');let calls=0;
  const retriever=createSemanticRetriever(pm,{subject,embed:()=>{calls++;throw Error('unused');}});
  assert.equal((await retriever.search({query:''})).semantic.called,false);assert.equal(calls,0);
  const empty=createSemanticRetriever(pm,{subject:peer,embed:()=>{calls++;throw Error('unused');}});assert.equal((await empty.search({query:'coffee'})).matches.length,0);assert.equal(calls,0);
});
test('unrelated vectors below threshold do not fabricate a semantic match',async()=>{
  const pm=new PersonaMemory();put(pm,'tea','tea');
  const result=await createSemanticRetriever(pm,{subject,embed:vectors}).search({query:'咖啡'});assert.equal(result.matches.length,0);assert.equal(result.semantic.matched,0);
});
test('candidate count and static filters bound what is sent to the provider',async()=>{
  const pm=new PersonaMemory();for(let i=0;i<10;i++)put(pm,'r'+i,'tea',{source:i%2?'manual':'user'});
  let count;const retriever=createSemanticRetriever(pm,{subject,sources:['user'],maxCandidates:2,embed:input=>{count=input.texts.length;return vectors(input);}});
  const result=await retriever.search({query:'coffee'});assert.equal(count,3);assert.equal(result.semantic.candidates,2);assert.equal(result.semantic.truncated,true);
  await assert.rejects(retriever.search({query:'coffee',subject:peer}),/field/);
});
test('complete-document input budgets omit oversized candidates instead of truncating source facts',async()=>{
  const pm=new PersonaMemory();put(pm,'large','x'.repeat(2000));let calls=0;
  const result=await createSemanticRetriever(pm,{subject,maxInputBytes:1024,embed:()=>{calls++;return [];}}).search({query:'coffee'});
  assert.equal(calls,0);assert.equal(result.semantic.omittedInputBudget,1);assert.equal(pm.getMemory('large').value.length,2000);
});
test('cached documents never bypass the query input byte budget',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');let calls=0;
  const retriever=createSemanticRetriever(pm,{subject,maxInputBytes:1024,embed:input=>{calls++;return vectors(input);}});
  await retriever.search({query:'coffee'});const result=await retriever.search({query:'咖'.repeat(400),locale:'zh'});
  assert.equal(result.semantic.called,false);assert.equal(calls,1);
});
test('document caching detaches vectors, respects capacity and clears explicitly',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');put(pm,'tea','tea');const lengths=[];let borrowed;
  const retriever=createSemanticRetriever(pm,{subject,cacheSize:2,embed:input=>{lengths.push(input.texts.length);borrowed=vectors(input);return borrowed;}});
  await retriever.search({query:'咖啡'});for(const vector of borrowed)vector.fill(0);
  const second=await retriever.search({query:'café',locale:'fr'});assert.equal(second.matches[0].record.id,'coffee');assert.deepEqual(lengths,[3,1]);assert.equal(second.semantic.cacheHits,2);
  retriever.clear();assert.equal(retriever.stats().cacheEntries,0);await retriever.search({query:'coffee'});assert.deepEqual(lengths,[3,1,3]);
});
test('a new record epoch discards prior cache even for reused IDs and revisions',async()=>{
  const pm=new PersonaMemory();put(pm,'source','coffee');const requests=[];
  const retriever=createSemanticRetriever(pm,{subject,embed:input=>{requests.push(input.texts);return vectors(input);}});
  await retriever.search({query:'coffee'});const snapshot=pm.export();snapshot.memories.source.value='tea';pm.import(snapshot);
  await retriever.search({query:'tea'});assert.equal(requests[1].length,2);assert.equal(requests[1][1].includes('coffee'),false);assert.equal(requests[1][1].includes('tea'),true);
});
test('stale derivatives are filtered before embedding or lexical recall',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),basis=put(pm,'source','coffee');
  put(pm,'derived','coffee DERIVED',{derivedFrom:[{id:basis.id,revision:basis.revision}]});now=2000;
  put(pm,'new','tea',{key:'source',replaceId:basis.id});let sent;
  const result=await createSemanticRetriever(pm,{subject,embed:input=>{sent=input.texts;return vectors(input);}}).search({query:'coffee'});
  assert.equal(result.matches.length,0);assert.equal(sent.join('').includes('DERIVED'),false);
});
test('a late provider result after a correction cannot commit cache or return an old fact',async()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),first=put(pm,'source','coffee'),ready=deferred(),answer=deferred();let request;
  const retriever=createSemanticRetriever(pm,{subject,embed:input=>{request=input;ready.resolve();return answer.promise;}});
  const searching=retriever.search({query:'coffee'});await ready.promise;now=2000;put(pm,'new','tea',{key:'source',replaceId:first.id});answer.resolve(vectors(request));
  const result=await searching;assert.equal(result.semantic.reason,'memory-changed');assert.equal(result.matches.length,0);assert.equal(retriever.stats().cacheEntries,0);
});
test('deadline fallback aborts once and ignores late completion without retrying',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');const answer=deferred();let signal,calls=0,request;
  const retriever=createSemanticRetriever(pm,{subject,timeoutMs:10,embed:input=>{calls++;signal=input.signal;request=input;return answer.promise;}});
  const result=await retriever.search({query:'coffee'});assert.equal(result.semantic.reason,'timeout');assert.equal(result.matches[0].record.id,'coffee');assert.equal(signal.aborted,true);assert.equal(calls,1);
  answer.resolve(vectors(request));await setImmediate();assert.equal(retriever.stats().cacheEntries,0);assert.equal(pm.diagnostics().confirmedTurns,0);
});
test('caller cancellation rejects before or during a provider call and never writes use records',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');let calls=0;
  const pre=new AbortController();pre.abort();const retriever=createSemanticRetriever(pm,{subject,embed:()=>{calls++;return [];}});
  await assert.rejects(retriever.search({query:'coffee',signal:pre.signal}),{code:'ERR_SEMANTIC_ABORTED'});assert.equal(calls,0);
  const started=deferred(),answer=deferred(),controller=new AbortController();
  const active=createSemanticRetriever(pm,{subject,embed:()=>{started.resolve();return answer.promise;}});
  const task=active.search({query:'coffee',signal:controller.signal});await started.promise;controller.abort();await assert.rejects(task,{code:'ERR_SEMANTIC_ABORTED'});answer.resolve([[1,0],[1,0]]);await setImmediate();assert.equal(active.stats().cacheEntries,0);assert.equal(pm.diagnostics().confirmedTurns,0);
});
test('overlapping and recursive semantic calls fail promptly instead of queuing forever',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');const started=deferred(),answer=deferred();
  const retriever=createSemanticRetriever(pm,{subject,embed:()=>{started.resolve();return answer.promise;}});
  const task=retriever.search({query:'coffee'});await started.promise;await assert.rejects(retriever.search({query:'coffee'}),{code:'ERR_SEMANTIC_BUSY'});assert.equal(retriever.stats().busy,true);
  answer.resolve([[1,0],[1,0]]);await task;assert.equal(retriever.stats().busy,false);
});
test('query parameters are snapshotted before awaiting a provider and getters added later are never read',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');const started=deferred(),answer=deferred();let calls=0;
  const retriever=createSemanticRetriever(pm,{subject,embed:()=>{started.resolve();return answer.promise;}});
  const query={query:'coffee',limit:1};const task=retriever.search(query);await started.promise;
  Object.defineProperty(query,'limit',{get(){calls++;return 1001;},enumerable:true});query.query='tea';
  answer.resolve([[1,0],[1,0]]);const result=await task;assert.equal(result.query,'coffee');assert.equal(result.matches.length,1);assert.equal(calls,0);
});
test('malformed vector counts, dimensions, numbers and zero vectors produce visible lexical fallback',async()=>{
  const invalid=[[],[[1,0]],[[1,0],[1]],[[1,0],[0,0]],[[1,0],[NaN,1]],[[1,0],new Array(2)],[[1,0],new Array(4097).fill(1)]];
  for(const result of invalid){
    const pm=new PersonaMemory();put(pm,'coffee','coffee');const retriever=createSemanticRetriever(pm,{subject,embed:()=>result}),answer=await retriever.search({query:'coffee'});
    assert.equal(answer.semantic.mode,'fallback');assert.equal(answer.matches[0].record.id,'coffee');assert.equal(retriever.stats().cacheEntries,0);
  }
});
test('arbitrary provider rejection values and error getters are sanitized without exposing secrets',async()=>{
  let accessed=0;const trap=Object.defineProperty({},'code',{get(){accessed++;return 'private-key';}});
  for(const cause of [null,undefined,'private-key',new Error('private-key'),trap]){
    const pm=new PersonaMemory();put(pm,'coffee','coffee');const retriever=createSemanticRetriever(pm,{subject,embed:()=>{throw cause;}});
    const result=await retriever.search({query:'coffee'});assert.equal(result.semantic.mode,'fallback');assert.equal(JSON.stringify(result.semantic).includes('private-key'),false);
  }
  assert.equal(accessed,0);
});
test('strict mode exposes a safe provider error instead of silently degrading',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');
  await assert.rejects(createSemanticRetriever(pm,{subject,fallback:'error',embed:()=>{throw Error('private-key');}}).search({query:'coffee'}),e=>e.code==='ERR_SEMANTIC_PROVIDER'&&!e.message.includes('private-key'));
});
test('a changed embedding dimension invalidates warm cache and never combines incompatible vectors',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');let dimensions=2;
  const retriever=createSemanticRetriever(pm,{subject,embed:({texts})=>texts.map(()=>Array.from({length:dimensions},(_,i)=>i?0:1))});
  await retriever.search({query:'coffee'});dimensions=3;assert.equal((await retriever.search({query:'coffee'})).semantic.mode,'fallback');assert.equal(retriever.stats().cacheEntries,0);
  assert.equal((await retriever.search({query:'coffee'})).semantic.mode,'hybrid');
});
test('very large finite vector values normalize without overflow or false non-finite scores',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');
  const result=await createSemanticRetriever(pm,{subject,embed:({texts})=>texts.map(()=>[1e308,1e308])}).search({query:'咖啡'});
  assert.equal(result.matches.length,1);assert.ok(Number.isFinite(result.matches[0].score));
});
test('semantic contexts retain whole-record budgets and require explicit confirmation after use',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');const retriever=createSemanticRetriever(pm,{subject,embed:vectors});
  const context=await retriever.buildContext({query:'咖啡',locale:'en',budget:2000,maxRecords:1,tokenBudget:2000,countTokens:text=>Array.from(text).length});
  assert.equal(context.records.length,1);assert.match(context.text,/Memory data/);assert.equal(pm.diagnostics().confirmedTurns,0);
  assert.equal(pm.confirmContext(context,{turnId:'used'}).memoryCount,1);
  const omitted=await retriever.buildContext({query:'coffee',budget:1});assert.equal(omitted.text,'');assert.equal(omitted.records.length,0);
});
test('invalid locale, options and query bounds fail before any provider call',async()=>{
  const pm=new PersonaMemory();put(pm,'coffee','coffee');let calls=0;const retriever=createSemanticRetriever(pm,{subject,embed:()=>{calls++;return [];}});
  for(const query of [{query:'x'.repeat(1025)},{query:'coffee',locale:'en_US'},{query:'coffee',limit:1001},{query:'coffee',signal:{}},{query:'coffee',extra:true}])await assert.rejects(retriever.search(query));
  await assert.rejects(retriever.buildContext({query:'coffee',budget:100001}));assert.equal(calls,0);
});
test('factory inputs are detached from later subject and filter mutations',async()=>{
  const pm=new PersonaMemory();put(pm,'public','coffee');put(pm,'private','coffee PRIVATE',{subject:peer});
  const options={subject:{...subject},sources:['manual'],embed:vectors},retriever=createSemanticRetriever(pm,options);options.subject.id=peer.id;options.sources.push('model');
  const result=await retriever.search({query:'coffee'});assert.deepEqual(result.matches.map(x=>x.record.id),['public']);
});
