import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PersonaMemory,MEMORY_KINDS} from '../src/index.js';

const DAY=86400000;
const user={type:'user',id:'same-id'},project={type:'project',id:'same-id'},task={type:'task',id:'same-id'};
function setup(config={}){
  let now=Date.UTC(2026,0,1);
  const pm=new PersonaMemory({clock:()=>now,config});
  return {pm,at(time){now=time;},advance(ms){now+=ms;},now:()=>now};
}
const put=(pm,more={})=>pm.putMemory({subject:project,kind:'constraint',key:'release',value:'publish at 1.0',...more});
function temp(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-records-'));
  t.after(()=>{
    const target=path.resolve(dir);
    assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(target).startsWith('pm-records-'));
    fs.rmSync(target,{recursive:true,force:true});
  });
  return dir;
}

test('one memory interface serves personal, project and learning records without social profiles',()=>{
  const {pm}=setup();
  const examples=[
    {subject:user,kind:'preference',key:'reply-format',value:{language:'zh',length:'short'}},
    {subject:project,kind:'constraint',key:'release',value:{version:'1.0',requires:['tests','migration']}},
    {subject:task,kind:'decision',key:'next-step',value:'practice fractions before equations'},
  ];
  for(const item of examples){
    const record=pm.putMemory(item);
    assert.deepEqual(pm.getMemory(record.id).value,item.value);
    assert.equal(pm.listMemories({subject:item.subject}).length,1);
  }
  assert.equal(pm.diagnostics().memories,3);
  assert.equal(pm.diagnostics().profiles,0);
  assert.equal(pm.getProfile('room','same-id'),null);
  assert.deepEqual(MEMORY_KINDS,['preference','fact','constraint','decision','episode','state']);
});

test('subjects and optional chat scopes are exact and never inferred across platforms',()=>{
  const {pm}=setup();
  const shared=put(pm,{subject:user});
  const a=put(pm,{subject:{...user,chatId:'a'}});
  const b=put(pm,{subject:{...user,chatId:'b'}});
  const projectRecord=put(pm);
  for(const [subject,id] of [[user,shared.id],[{...user,chatId:'a'},a.id],[{...user,chatId:'b'},b.id],[project,projectRecord.id]])
    assert.deepEqual(pm.listMemories({subject}).map(r=>r.id),[id]);
  assert.throws(()=>pm.listMemories(),/subject/);
  const other=new PersonaMemory({scope:'other'});
  assert.equal(other.getMemory(shared.id),null);
  assert.throws(()=>other.import(pm.export()),/scope/);
});

test('temporary states expire independently of stable preferences and project constraints',()=>{
  const {pm,advance,now}=setup();
  const state=put(pm,{kind:'state',key:'energy',value:'tired'});
  const episode=put(pm,{kind:'episode',key:'attempt',value:{method:'A',outcome:'failed'}});
  const preference=put(pm,{subject:user,kind:'preference',key:'language',value:'zh'});
  const constraint=put(pm);
  assert.equal(state.expiresAt,now()+2*DAY);
  assert.equal(episode.expiresAt,now()+90*DAY);
  assert.equal(preference.expiresAt,null);
  advance(2*DAY);
  assert.equal(pm.getMemory(state.id),null);
  assert.ok(pm.getMemory(state.id,{includeInactive:true}));
  assert.equal(pm.maintain().memoriesExpired,1);
  advance(100*DAY);
  assert.equal(pm.maintain().memoriesExpired,1);
  for(const record of [preference,constraint])assert.deepEqual(pm.getMemory(record.id),record);
});

test('per-record expiry and lifetime configuration are explicit, including zero',()=>{
  const {pm,now}=setup({stateMemoryTtlHours:0,episodeMemoryTtlDays:1});
  const zero=put(pm,{kind:'state',key:'zero',value:0});
  assert.equal(pm.getMemory(zero.id),null);
  const stableState=put(pm,{kind:'state',key:'explicit-stable',expiresAt:null});
  assert.equal(stableState.expiresAt,null);
  const shortPreference=put(pm,{kind:'preference',key:'temporary-format',expiresAt:now()+100});
  assert.equal(shortPreference.expiresAt,now()+100);
  const before=pm.export();
  assert.throws(()=>put(pm,{key:'bad-expiry',expiresAt:now()-1}),/expiry/);
  assert.deepEqual(pm.export(),before);
  assert.throws(()=>new PersonaMemory({config:{stateMemoryTtlHours:Infinity}}));
});

test('changing a current memory requires an explicit predecessor and preserves its provenance',()=>{
  const {pm,advance}=setup();
  const first=put(pm,{id:'release-v1',source:'user',evidenceId:'instruction-1'});
  const before=pm.export();
  assert.throws(()=>put(pm,{value:'publish at 0.5'}),{code:'ERR_MEMORY_CONFLICT'});
  assert.deepEqual(pm.export(),before);
  advance(1);
  const second=put(pm,{id:'release-v2',value:'publish at 1.1',replaceId:first.id,source:'host',evidenceId:'instruction-2'});
  assert.equal(second.revision,2);assert.equal(second.supersedes,first.id);
  assert.equal(pm.getMemory(first.id),null);
  const historical=pm.getMemory(first.id,{includeInactive:true});
  assert.equal(historical.value,'publish at 1.0');assert.equal(historical.source,'user');
  assert.equal(historical.status,'superseded');assert.equal(historical.supersededBy,second.id);
  assert.deepEqual(pm.listMemories({subject:project}).map(r=>r.id),[second.id]);
  assert.equal(pm.listMemories({subject:project,includeInactive:true}).length,2);
  for(const more of [{subject:task},{kind:'fact'},{key:'different'},{replaceId:'missing'}]){
    const current=pm.export();
    assert.throws(()=>put(pm,{...more,replaceId:more.replaceId??second.id}),{code:'ERR_MEMORY_CONFLICT'});
    assert.deepEqual(pm.export(),current);
  }
});

test('a stable caller ID makes retries pure, while reusing it for other content fails atomically',()=>{
  const {pm,advance}=setup({maxMemories:1});
  const first=put(pm,{id:'retry',value:{b:2,a:1}});
  const before=pm.export();
  advance(DAY);
  assert.deepEqual(put(pm,{id:'retry',value:{a:1,b:2}}),first);
  assert.deepEqual(pm.export(),before);
  assert.throws(()=>put(pm,{id:'retry',value:'changed'}),{code:'ERR_MEMORY_CONFLICT'});
  assert.deepEqual(pm.export(),before);
});

test('expired observations can be replaced, and stale clocks cannot overwrite a newer record',()=>{
  const {pm,advance,at,now}=setup();
  const first=put(pm,{kind:'state',key:'energy',value:'tired',expiresAt:now()+10});
  advance(11);
  const second=put(pm,{kind:'state',key:'energy',value:'rested'});
  assert.equal(second.supersedes,first.id);
  const before=pm.export();
  at(second.createdAt-1);
  assert.throws(()=>put(pm,{kind:'state',key:'energy',replaceId:second.id,value:'unknown'}),{code:'ERR_MEMORY_CONFLICT'});
  assert.deepEqual(pm.export(),before);
});

test('JSON values are detached, canonical and preserve false, zero, null and empty strings',()=>{
  const {pm}=setup(),value={nested:[false,0,null,'',{a:1}]};
  const record=put(pm,{value});
  value.nested[4].a=99;record.value.nested[4].a=88;
  const read=pm.getMemory(record.id);assert.equal(read.value.nested[4].a,1);
  read.value.nested[4].a=77;
  const listed=pm.listMemories({subject:project});listed[0].value.nested[4].a=66;
  assert.equal(pm.getMemory(record.id).value.nested[4].a,1);
  const restored=new PersonaMemory();restored.import(pm.export());
  assert.deepEqual(restored.export(),pm.export());
});

test('non-JSON, cyclic, accessor, sparse and oversized values fail before state changes',()=>{
  const {pm}=setup(),cycle={};cycle.self=cycle;
  let invoked=0;const getter={get value(){invoked++;return 1;}};
  let deep=0;for(let i=0;i<10;i++)deep={child:deep};
  const invalid=[undefined,NaN,Infinity,1n,new Date(),cycle,getter,Array(3),[undefined],{x:undefined},deep,
    'a'.repeat(8193),Array.from({length:129},()=>0),JSON.parse('{"__proto__":{"polluted":true}}')];
  for(const value of invalid){
    const before=pm.export();
    assert.throws(()=>put(pm,{value}));
    assert.deepEqual(pm.export(),before);
  }
  assert.equal(invoked,0);assert.equal({}.polluted,undefined);
  const large={a:'a'.repeat(8192),b:'b'.repeat(8192)};
  assert.throws(()=>put(pm,{value:large}),/byte limit/);
  const before=pm.export();
  const snapshot=pm.export();
  const valid=put(pm,{id:'valid'});
  const malformed=pm.export();malformed.memories.valid.value={missing:undefined};
  assert.throws(()=>pm.import(malformed),/JSON/);
  assert.equal(pm.getMemory(valid.id).value,'publish at 1.0');
  pm.import(snapshot);assert.deepEqual(pm.export(),before);
});

test('capacity includes inactive versions and failed writes cannot consume a caller ID',()=>{
  const {pm}=setup({maxMemories:1}),first=put(pm,{id:'first'});
  const before=pm.export();
  assert.throws(()=>put(pm,{id:'second',replaceId:first.id,value:'new'}),{code:'ERR_MEMORY_CAPACITY'});
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.forgetMemory(first.id).removed,1);
  assert.equal(put(pm,{id:'second',value:'new'}).id,'second');
  const disabled=new PersonaMemory({config:{maxMemories:0}});
  assert.throws(()=>put(disabled),{code:'ERR_MEMORY_CAPACITY'});
  assert.equal(disabled.diagnostics().memories,0);
});

test('forgetting a logical memory removes every version and does not revive an old value',()=>{
  const {pm}=setup();
  const first=put(pm),second=put(pm,{replaceId:first.id,value:'new release'});
  const unrelated=put(pm,{key:'other',value:'keep'});
  assert.equal(pm.forgetMemory(second.id).removed,2);
  assert.equal(pm.getMemory(first.id,{includeInactive:true}),null);
  assert.equal(pm.listMemories({subject:project}).length,1);
  assert.equal(pm.getMemory(unrelated.id).value,'keep');
  assert.ok(pm.history({subject:project}).every(r=>r.recordId===unrelated.id));
  assert.equal(pm.forgetMemory(second.id).removed,0);
});

test('user deletion covers structured user records while retaining distinct projects and channels',()=>{
  const {pm}=setup();
  const global=put(pm,{subject:user});
  const a=put(pm,{subject:{...user,chatId:'a'}});
  const b=put(pm,{subject:{...user,chatId:'b'}});
  const unrelated=put(pm);
  pm.deleteUser(user.id,{chatId:'a'});
  assert.equal(pm.getMemory(a.id),null);assert.ok(pm.getMemory(global.id));assert.ok(pm.getMemory(b.id));
  pm.deleteUser(user.id);
  assert.equal(pm.getMemory(global.id),null);assert.equal(pm.getMemory(b.id),null);
  assert.ok(pm.getMemory(unrelated.id));
  assert.ok(pm.history().every(r=>r.subject.type==='project'));
  assert.equal(pm.deleteSubject(project).removed,1);
  assert.equal(pm.diagnostics().memories,0);
});

test('schema 4 persists typed records and keeps schema 2 and original 0.3 migration readable',t=>{
  const dir=temp(t),{pm,now}=setup();
  const record=put(pm,{value:{goal:'unified-release',version:'1.0'}});
  const stored=new PersonaMemory({storage:dir,clock:now});
  stored.import(pm.export());stored.flush();
  const reloaded=new PersonaMemory({storage:dir,clock:now});
  assert.equal(reloaded.export().schemaVersion,5);assert.deepEqual(reloaded.getMemory(record.id),record);
  const v2=new PersonaMemory().export();v2.schemaVersion=2;delete v2.memories;
  const migrated=new PersonaMemory();migrated.import(v2);
  assert.equal(migrated.export().schemaVersion,5);assert.equal(migrated.diagnostics().memories,0);
  const old=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-0.3.json',import.meta.url),'utf8')).snapshot;
  const legacy=new PersonaMemory({persona:old.persona});legacy.import(old);
  assert.equal(legacy.diagnostics().profiles,2);assert.equal(legacy.diagnostics().memories,0);
});

test('invalid snapshots and replacement graphs fail atomically instead of dropping records',()=>{
  const {pm}=setup(),first=put(pm,{id:'a'}),second=put(pm,{id:'b',replaceId:first.id,value:'new'});
  const good=pm.export();
  const mutations=[
    snapshot=>{snapshot.schemaVersion=2;},
    snapshot=>{delete snapshot.memories;},
    snapshot=>{snapshot.memories.b.id='different';},
    snapshot=>{snapshot.memories.a.status='current';delete snapshot.memories.a.supersededBy;},
    snapshot=>{snapshot.memories.b.supersedes='b';},
    snapshot=>{snapshot.memories.b.revision=50;},
    snapshot=>{snapshot.memories.b.subject=task;},
    snapshot=>{snapshot.memories.b.expiresAt=-1;},
    snapshot=>{snapshot.memories.b.extra='unknown';},
  ];
  for(const mutate of mutations){
    const bad=structuredClone(good);mutate(bad);
    assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),good);
  }
  const other=new PersonaMemory({config:{maxMemories:1}});
  assert.throws(()=>other.import(good),{code:'ERR_MEMORY_CAPACITY'});
  assert.equal(other.diagnostics().memories,0);
});

test('oversized typed snapshots preserve the prior valid disk file',t=>{
  const dir=temp(t),pm=new PersonaMemory({storage:dir,clock:()=>1000,config:{maxSnapshotBytes:4096}});
  put(pm,{id:'first'});pm.flush();
  const file=path.join(dir,'default.json'),before=fs.readFileSync(file,'utf8');
  put(pm,{key:'large',value:'x'.repeat(4096)});
  assert.throws(()=>pm.flush(),{code:'ERR_MEMORY_CAPACITY'});
  assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal(new PersonaMemory({storage:dir}).diagnostics().memories,1);
});

test('list filters and clear have explicit boundaries across all memory kinds',()=>{
  const {pm}=setup();
  for(const kind of MEMORY_KINDS)put(pm,{kind,key:kind,value:kind});
  assert.equal(pm.listMemories({subject:project,kind:'fact'}).length,1);
  assert.equal(pm.listMemories({subject:project,key:'decision'})[0].kind,'decision');
  assert.equal(pm.listMemories({subject:project,limit:0}).length,0);
  assert.throws(()=>pm.listMemories({subject:project,includeInactive:'false'}),/boolean/);
  assert.throws(()=>pm.listMemories({subject:project,limit:1001}),/limit/);
  assert.throws(()=>pm.listMemories({subject:project,query:'not implemented yet'}),/field/);
  assert.equal(pm.clear().removed,MEMORY_KINDS.length);
  assert.equal(pm.diagnostics().memories,0);assert.equal(pm.history().length,0);
});

test('fixed-seed typed-memory replay preserves slot, capacity and snapshot invariants',()=>{
  let now=Date.UTC(2026,0,1),seed=18379;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  const config={maxMemories:80,stateMemoryTtlHours:0.001,episodeMemoryTtlDays:1};
  const pm=new PersonaMemory({config,clock:()=>now});
  for(let i=0;i<1200;i++){
    now+=random(2000)+1;
    const subject={type:['user','project','task'][random(3)],id:'s'+random(4)};
    const kind=MEMORY_KINDS[random(MEMORY_KINDS.length)],key='field'+random(4);
    const current=pm.listMemories({subject,kind,key})[0],before=pm.export();
    try{
      switch(random(5)){
        case 0:case 1:pm.putMemory({id:'operation-'+i,subject,kind,key,value:{iteration:i,ok:i%2===0},...(current?{replaceId:current.id}:{})});break;
        case 2:pm.maintain();break;
        case 3:if(current)pm.forgetMemory(current.id);break;
        case 4:pm.deleteSubject(subject);break;
      }
    }catch(error){assert.equal(error.code,'ERR_MEMORY_CAPACITY');assert.deepEqual(pm.export(),before);}
    const snapshot=pm.export(),slots=new Set();
    assert.ok(Object.keys(snapshot.memories).length<=80);
    for(const record of Object.values(snapshot.memories))if(record.status==='current'){
      const slot=JSON.stringify([record.subject,record.kind,record.key]);
      assert.ok(!slots.has(slot));slots.add(slot);
    }
    if(i%25===0){const restored=new PersonaMemory({config,clock:()=>now});restored.import(snapshot);assert.deepEqual(restored.export(),snapshot);}
  }
});

test('external watchdog bounds malformed and excessive typed-memory input',()=>{
  const worker=fileURLToPath(new URL('./fixtures/records-worker.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[worker],{encoding:'utf8',windowsHide:true,timeout:testTimeout(10000),maxBuffer:1048576});
  assert.equal(result.error,undefined,'typed-memory worker exceeded OS deadline');
  assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('"completed":true'));
});

test('inherited object names are absent records and cannot corrupt pruned replacement links',()=>{
  const {pm,advance,now}=setup();
  for(const id of ['toString','valueOf','hasOwnProperty']){
    assert.equal(pm.getMemory(id,{includeInactive:true}),null);
    assert.equal(pm.forgetMemory(id).removed,0);
  }
  const first=put(pm,{id:'toString',kind:'state',key:'energy',expiresAt:now()+10});
  advance(5);
  const second=put(pm,{kind:'state',key:'energy',replaceId:first.id,value:'rested'});
  advance(5);assert.equal(pm.maintain().memoriesExpired,1);
  const restored=new PersonaMemory({clock:now});restored.import(pm.export());
  assert.equal(restored.getMemory(second.id).value,'rested');
  assert.equal(restored.getMemory('toString',{includeInactive:true}),null);
});
