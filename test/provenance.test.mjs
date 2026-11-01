import {createHash} from 'node:crypto';
import {memorySlot} from '../src/records.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {prepareAgentBundle,createAgentSession} from '../adapters/agent/index.js';
const slotFingerprint=record=>createHash('sha256').update(memorySlot(record)).digest('hex');
const subject={type:'project',id:'work'},peer={type:'project',id:'other'},ref=record=>({id:record.id,revision:record.revision});
const source=(pm,id='source',value='English',extra={})=>pm.putMemory({id,subject,kind:'fact',key:id,value,source:'user',...extra});
const summary=(pm,base,id='summary',extra={})=>pm.putMemory({id,subject,kind:'fact',key:id,value:'summary: '+base.value,source:'model',derivedFrom:[ref(base)],...extra});
const directory=t=>{const base=path.resolve(fileURLToPath(new URL('../.artifacts/',import.meta.url)));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'provenance-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;};

test('derived memory stores server-calculated content references and hides after a correction across all normal read paths',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),first=source(pm),derived=summary(pm,first);
  assert.match(derived.derivedFrom[0].fingerprint,/^[0-9a-f]{64}$/);assert.equal(pm.memoryStatus(derived.id).usable,true);
  now=1100;source(pm,'source-new','日本語',{key:'source',replaceId:first.id});
  assert.equal(pm.getMemory(derived.id),null);assert.equal(pm.listMemories({subject}).some(x=>x.id===derived.id),false);
  assert.equal(pm.searchMemories({subject,query:'summary',locale:'en'}).matches.length,0);
  assert.equal(pm.buildMemoryContext({subject,query:'summary',locale:'en',budget:5000}).records.length,0);
  assert.equal(pm.getMemory(derived.id,{includeInactive:true}).value,'summary: English');
  assert.equal(pm.memoryStatus(derived.id).reason,'dependency-inactive');
});

test('dependent experiences and transitive summaries become stale together',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm),b=summary(pm,a),c=summary(pm,b,'second');
  const experience=pm.recordExperience({id:'experience',subject,key:'method',task:'task',attempt:'method',result:'worked',outcome:'success',verified:true,evidenceId:'host-result',derivedFrom:[ref(c)]});
  assert.equal(pm.listExperiences({subject}).length,1);now=2000;source(pm,'new','changed',{key:'source',replaceId:a.id});
  assert.equal(pm.getMemory(c.id),null);assert.equal(pm.getMemory(experience.id),null);assert.equal(pm.listExperiences({subject}).length,0);
});

test('dependency fingerprints catch changed content imported under the same ID and revision',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm),b=summary(pm,a),snapshot=pm.export();
  snapshot.memories[a.id].value='different imported assertion';const restored=new PersonaMemory({clock:()=>1000});restored.import(snapshot);
  assert.equal(restored.memoryStatus(b.id).reason,'dependency-changed');assert.equal(restored.getMemory(b.id),null);
});

test('scheduled corrections preserve the previous derived interval but hide it at activation',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm),b=summary(pm,a);
  now=1100;source(pm,'next','French',{key:'source',replaceId:a.id,validFrom:2000});
  now=1999;assert.equal(pm.getMemory(b.id).value,'summary: English');
  now=2000;assert.equal(pm.getMemory(b.id),null);
  assert.equal(pm.getMemoryAt({subject,kind:'fact',key:'summary',at:1500,knownAt:1900}).id,b.id);
  assert.equal(pm.getMemoryAt({subject,kind:'fact',key:'summary',at:2000}),null);
});

test('derived retention is capped by source expiry and cannot schedule beyond it',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm,'source','short lived',{expiresAt:2000}),b=summary(pm,a),c=summary(pm,b,'nested',{expiresAt:9000});
  assert.equal(b.expiresAt,2000);assert.equal(c.expiresAt,2000);
  assert.throws(()=>summary(pm,a,'future',{validFrom:3000}),/expiry|stale/);now=2000;
  assert.equal(pm.getMemory(b.id),null);assert.equal(pm.getMemory(c.id),null);
});

test('a pending derived proposal remains unsearchable and acceptance preserves its references across restore',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm);
  const proposed=pm.proposeMemory({memory:{subject,kind:'fact',key:'summary',value:'derived',evidenceId:'source-turn',derivedFrom:[ref(a)]}});
  assert.equal(pm.searchMemories({subject,query:'derived'}).matches.length,0);
  const accepted=pm.acceptCandidate(proposed.id,{expectedRevision:1});assert.equal(accepted.record.derivedFrom[0].id,a.id);
  const restored=new PersonaMemory({clock:()=>1000});restored.import(pm.export());assert.equal(restored.getMemory(accepted.record.id).value,'derived');
});

test('changed provenance rejects acceptance atomically even when the target field has not changed',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm),proposal=pm.proposeMemory({memory:{subject,kind:'fact',key:'summary',value:'old derived',evidenceId:'turn',derivedFrom:[ref(a)]}});
  now=2000;source(pm,'new','corrected',{key:'source',replaceId:a.id});const before=pm.export();
  assert.throws(()=>pm.acceptCandidate(proposal.id,{expectedRevision:1}),/dependency/);assert.deepEqual(pm.export(),before);
  const copy=new PersonaMemory({clock:()=>now});copy.import(before);assert.equal(copy.getCandidate(proposal.id).status,'pending');
});

test('revising a pending proposal can refresh its sources without bypassing candidate revision checks',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm,'a'),b=source(pm,'b','fresh');
  const candidate=pm.proposeMemory({memory:{subject,kind:'fact',key:'summary',value:'one',evidenceId:'turn',derivedFrom:[ref(a)]}});
  const revised=pm.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'two',derivedFrom:[ref(b)]}});
  assert.throws(()=>pm.acceptCandidate(candidate.id,{expectedRevision:1}),/revised/);
  assert.equal(pm.acceptCandidate(candidate.id,{expectedRevision:revised.revision}).record.derivedFrom[0].id,b.id);
});

test('missing, incorrect, cross-subject and same-field dependencies fail without partial changes',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm),privateRecord=source(pm,'private','private',{subject:peer});
  const inputs=[[{id:'missing',revision:1}],[{id:a.id,revision:2}],[{...ref(a),fingerprint:'0'.repeat(64)}],[ref(privateRecord)]];
  for(const derivedFrom of inputs){const before=pm.export();assert.throws(()=>summary(pm,a,'bad',{derivedFrom}));assert.deepEqual(pm.export(),before);}
  assert.throws(()=>summary(pm,a,'next',{key:a.key,replaceId:a.id}),/another field/);
});

test('a proposed dependency cycle via replacing another field is refused atomically',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm,'a'),b=summary(pm,a,'b');now=2000;
  const before=pm.export();assert.throws(()=>summary(pm,b,'a2',{key:'a',replaceId:a.id}),/stale/);assert.deepEqual(pm.export(),before);
});

test('cyclic or cross-subject snapshot dependency graphs are rejected before replacing good state',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm,'a'),b=source(pm,'b'),snapshot=pm.export();
  snapshot.memories[a.id].derivedFrom=[{...ref(b),fingerprint:'a'.repeat(64),slotFingerprint:slotFingerprint(b)}];snapshot.memories[b.id].derivedFrom=[{...ref(a),fingerprint:'b'.repeat(64),slotFingerprint:slotFingerprint(a)}];
  const before=pm.export();assert.throws(()=>pm.import(snapshot),/cyclic/);assert.deepEqual(pm.export(),before);
  const foreign=pm.export();foreign.memories[b.id].subject=peer;foreign.memories[a.id].derivedFrom=[{...ref(b),fingerprint:'a'.repeat(64),slotFingerprint:slotFingerprint(b)}];
  assert.throws(()=>pm.import(foreign),/dependency scope/);assert.deepEqual(pm.export(),before);
});

test('depth and distinct-source work limits reject oversized derivations',()=>{
  const pm=new PersonaMemory({clock:()=>1000});let last=source(pm);
  for(let i=1;i<=8;i++)last=summary(pm,last,'d'+i);
  assert.throws(()=>summary(pm,last,'d9'),/stale/);
  const large=new PersonaMemory({clock:()=>1000}),roots=[];
  for(let i=0;i<128;i++)roots.push(source(large,'r'+i));
  const groups=[];for(let i=0;i<8;i++)groups.push(summary(large,roots[i*16],'g'+i,{derivedFrom:roots.slice(i*16,i*16+16).map(ref)}));
  const before=large.export();assert.throws(()=>summary(large,groups[0],'too-wide',{derivedFrom:groups.map(ref)}),/stale/);assert.deepEqual(large.export(),before);
});

test('dependency arrays reject duplicate IDs, sparse entries, getters and oversized fan-out',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm);let calls=0;
  const getter={id:a.id};Object.defineProperty(getter,'revision',{enumerable:true,get(){calls++;return 1;}});
  for(const refs of [[],[ref(a),ref(a)],Array(1),[getter],Array.from({length:17},()=>ref(a))]){
    const before=pm.export();assert.throws(()=>summary(pm,a,'bad',{derivedFrom:refs}));assert.deepEqual(pm.export(),before);
  }
  assert.equal(calls,0);
});

test('forget preview and deletion remove transitive derived histories and pending candidates while preserving peers',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm),b=summary(pm,a),c=summary(pm,b,'second');
  source(pm,'peer','private',{subject:peer});source(pm,'unrelated','keep');
  now=2000;const fresh=source(pm,'source-new','French',{key:'source',replaceId:a.id});
  const revised=summary(pm,fresh,'summary-new',{key:'summary',replaceId:b.id});
  const candidate=pm.proposeMemory({memory:{subject,kind:'fact',key:'pending-derived',value:'French',evidenceId:'turn',derivedFrom:[ref(revised)]}});
  const before=pm.export(),preview=pm.previewForgetMemory(fresh.id);assert.deepEqual(pm.export(),before);
  assert.deepEqual(preview.recordIds.sort(),[a.id,b.id,c.id,fresh.id,revised.id].sort());assert.deepEqual(preview.candidateIds,[candidate.id]);
  assert.equal(pm.forgetMemory(fresh.id).removed,6);
  for(const id of preview.recordIds)assert.equal(pm.getMemory(id,{includeInactive:true}),null);
  assert.equal(pm.getCandidate(candidate.id,{includeExpired:true}),null);assert.equal(pm.getMemory('peer').value,'private');assert.equal(pm.getMemory('unrelated').value,'keep');
});

test('forgetting a pruned source ID still removes stale dependents using retained ancestry',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now,config:{maxVersionsPerMemory:1}}),a=source(pm),b=summary(pm,a);
  now=2000;const replacement=source(pm,'new','changed',{key:'source',replaceId:a.id});assert.equal(pm.getMemory(a.id,{includeInactive:true}),null);
  assert.deepEqual(pm.previewForgetMemory(a.id).recordIds.sort(),[b.id,replacement.id].sort());assert.equal(pm.forgetMemory(a.id).removed,2);
});

test('missing retained dependency references hydrate as stale and never become ordinary facts',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm),b=summary(pm,a),snapshot=pm.export();delete snapshot.memories[a.id];
  const copy=new PersonaMemory({clock:()=>1000});copy.import(snapshot);
  assert.equal(copy.memoryStatus(b.id).reason,'dependency-missing');assert.equal(copy.getMemory(b.id),null);
});

test('old contexts cannot count a derived record after its source has been corrected',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),a=source(pm);summary(pm,a);
  const context=pm.buildMemoryContext({subject,keys:['summary'],budget:4000,locale:'en'});assert.equal(context.records.length,1);assert.match(context.text,/derivedFrom/);
  now=2000;source(pm,'new','changed',{key:'source',replaceId:a.id});assert.equal(pm.confirmContext(context,{turnId:'used-old'}).memoryCount,0);
});

test('portable v1 exports refuse to strip live provenance and full snapshots preserve it',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),a=source(pm),b=summary(pm,a);
  assert.throws(()=>pm.exportMemories({subject,keys:['summary']}),/cannot preserve dependencies/);
  assert.equal(pm.exportMemories({subject,keys:['source']}).records.length,1);
  const copy=new PersonaMemory({clock:()=>1000});copy.import(pm.export());assert.deepEqual(copy.getMemory(b.id).derivedFrom,pm.getMemory(b.id).derivedFrom);
});

test('schema 5 snapshots upgrade without changing their source file, while forged old-schema dependencies are rejected',t=>{
  const dir=directory(t),original=new PersonaMemory({clock:()=>1000});source(original);const old=original.export();old.schemaVersion=5;
  const file=path.join(dir,'default.json');fs.writeFileSync(file,JSON.stringify(old));const before=fs.readFileSync(file),loaded=new PersonaMemory({storage:dir,clock:()=>1000});
  assert.equal(loaded.export().schemaVersion,6);assert.equal(loaded.getMemory('source').value,'English');assert.ok(before.equals(fs.readFileSync(file)));
  old.memories.source.derivedFrom=[{id:'missing',revision:1,fingerprint:'a'.repeat(64),slotFingerprint:'a'.repeat(64)}];const state=loaded.export();
  assert.throws(()=>loaded.import(old),/schemaVersion=6/);assert.deepEqual(loaded.export(),state);
});

test('multilingual provenance survives disk reload without rewriting source content',t=>{
  const dir=directory(t),pm=new PersonaMemory({storage:dir,clock:()=>1000}),a=source(pm,'source','cafe\u0301 — कॉफ़ी — قهوة'),b=summary(pm,a);
  pm.flush();const copy=new PersonaMemory({storage:dir,clock:()=>1000});assert.equal(copy.getMemory(a.id).value,a.value);assert.equal(copy.getMemory(b.id).derivedFrom[0].fingerprint,b.derivedFrom[0].fingerprint);
});

test('Agent-derived proposals cannot reference personal scope and approved derivatives vanish after project correction',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,userId:'owner'}),binding=bundle.binding;
  const pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace,clock:()=>1000});
  const a=source(pm,'source','English',{subject:binding.subjects.project}),secret=source(pm,'private','private',{subject:binding.subjects.personal});await pm.persist();
  const owner=createAgentSession(pm,{...binding,access:'review'});
  const raw={scope:'project',kind:'fact',key:'summary',value:'English preference',evidenceId:'task',reason:'summary',derivedFrom:[ref(secret)]};
  await assert.rejects(owner.call('memory_propose',raw),/same subject/);
  const proposed=await owner.call('memory_propose',{...raw,derivedFrom:[ref(a)]});const accepted=await owner.call('memory_review',{scope:'project',candidateId:proposed.candidate.id,expectedRevision:1,decision:'accept'});
  assert.equal((await owner.call('memory_recall',{scope:'project',query:'summary'})).matches[0].record.id,accepted.record.id);
  const correction=await owner.call('memory_propose',{scope:'project',kind:'fact',key:'source',value:'日本語',evidenceId:'correction',reason:'user correction'});
  await owner.call('memory_review',{scope:'project',candidateId:correction.candidate.id,expectedRevision:1,decision:'accept'});
  assert.equal((await owner.call('memory_recall',{scope:'project',query:'summary'})).matches.length,0);
});

test('forgetting after multiple source versions were pruned still erases every derived copy',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now,config:{maxVersionsPerMemory:1}}),first=source(pm),derived=summary(pm,first);
  now=2000;const next=source(pm,'v2','second',{key:'source',replaceId:first.id});
  now=3000;const latest=source(pm,'v3','third',{key:'source',replaceId:next.id});
  assert.equal(pm.getMemory(first.id,{includeInactive:true}),null);assert.equal(pm.memoryStatus(derived.id).usable,false);
  pm.forgetMemory(latest.id);assert.equal(pm.getMemory(derived.id,{includeInactive:true}),null);
});
