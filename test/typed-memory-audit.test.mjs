import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory} from '../src/index.js';

const subject={type:'project',id:'audit'};
function setup(){
  let now=1000;
  const pm=new PersonaMemory({clock:()=>now});
  const put=extra=>pm.putMemory({subject,kind:'constraint',key:'release',value:'old value',...extra});
  return {pm,put,at(value){now=value;},now:()=>now};
}
function restores(pm,now){
  const restored=new PersonaMemory({clock:now});
  restored.import(pm.export());
  assert.deepEqual(restored.export(),pm.export());
}

test('Unicode keys use a total canonical order for retry and snapshot reload',()=>{
  const {pm,put,now}=setup();
  const first=put({id:'unicode',value:{nested:{'é':1,'e\u0301':2},'Å':3,'A\u030a':4}});
  const before=pm.export();
  assert.deepEqual(put({id:'unicode',value:{'A\u030a':4,'Å':3,nested:{'e\u0301':2,'é':1}}}),first);
  assert.deepEqual(pm.export(),before);
  restores(pm,now);
  const restored=new PersonaMemory({clock:now});restored.import(pm.export());
  assert.deepEqual(restored.putMemory({id:first.id,subject,kind:'constraint',key:'release',
    value:{'A\u030a':4,'Å':3,nested:{'e\u0301':2,'é':1}}}),first);
});

test('a pruned predecessor ID cannot be reused across subjects or to form a replacement cycle',()=>{
  for(const sameSlot of [false,true]){
    const {pm,put,at,now}=setup();
    const first=put({id:'old-id',expiresAt:1010});
    at(1005);const second=put({id:'current-id',replaceId:first.id,value:'current'});
    at(1010);assert.equal(pm.maintain().memoriesExpired,1);
    const before=pm.export();
    assert.throws(()=>put({id:first.id,value:'reuse',
      ...(sameSlot?{replaceId:second.id}:{subject:{type:'task',id:'other'},key:'different'})}),
      {code:'ERR_MEMORY_CONFLICT'});
    assert.deepEqual(pm.export(),before);
    restores(pm,now);
    pm.forgetMemory(second.id);
    assert.equal(put({id:first.id,key:'after-forgetting',value:'new'}).id,first.id);
  }
});

test('a pruned successor ID stays reserved while older versions reference it',()=>{
  const {pm,put,at,now}=setup();
  const first=put({id:'older'});
  at(1005);const second=put({id:'expired-current',replaceId:first.id,value:'current',expiresAt:1010});
  at(1010);pm.maintain();
  const before=pm.export();
  assert.throws(()=>put({id:second.id,subject:{type:'project',id:'unrelated'},key:'other'}),
    {code:'ERR_MEMORY_CONFLICT'});
  assert.deepEqual(pm.export(),before);restores(pm,now);
});

test('forgetting a pruned current ID still removes the retained old value and its history',()=>{
  const {pm,put,at,now}=setup();
  const first=put({id:'private-old',value:'private old value'});
  at(1005);const second=put({id:'pruned-current',replaceId:first.id,value:'private new value',expiresAt:1010});
  const other=put({id:'unrelated',key:'other',value:'keep'});
  at(1010);pm.maintain();
  assert.equal(pm.getMemory(second.id,{includeInactive:true}),null);
  assert.equal(pm.forgetMemory(second.id).removed,1);
  assert.equal(pm.getMemory(first.id,{includeInactive:true}),null);
  assert.equal(pm.getMemory(other.id).value,'keep');
  assert.ok(!JSON.stringify(pm.export()).includes('private old value'));
  assert.ok(pm.history({subject}).every(row=>row.recordId===other.id));
  assert.equal(pm.forgetMemory(second.id).removed,0);restores(pm,now);
});

test('forgetting a pruned middle ID resolves both sides of the chain without touching other slots',()=>{
  const {pm,put,at,now}=setup();
  const first=put({id:'a'});
  at(1005);const middle=put({id:'b',replaceId:first.id,value:'middle',expiresAt:1015});
  at(1010);const last=put({id:'c',replaceId:middle.id,value:'latest'});
  const other=put({id:'d',key:'other'});
  at(1015);assert.equal(pm.maintain().memoriesExpired,1);
  assert.equal(pm.forgetMemory(middle.id).removed,2);
  assert.equal(pm.getMemory(first.id,{includeInactive:true}),null);
  assert.equal(pm.getMemory(last.id,{includeInactive:true}),null);
  assert.ok(pm.getMemory(other.id));
  restores(pm,now);
});

test('snapshot record collection accessors are rejected without invoking them',()=>{
  const {pm,put}=setup();const record=put({id:'one'}),before=pm.export();
  const snapshot=pm.export();let reads=0;
  snapshot.memories={get one(){reads++;return record;}};
  assert.throws(()=>pm.import(snapshot));
  assert.equal(reads,0);assert.deepEqual(pm.export(),before);
});

test('snapshot collection rejects hidden and symbolic entries instead of dropping records',()=>{
  const {pm,put}=setup();const record=put({id:'one'}),before=pm.export();
  for(const symbolic of [false,true]){
    const snapshot=pm.export();snapshot.memories={};
    Object.defineProperty(snapshot.memories,symbolic?Symbol('one'):'one',{value:record,enumerable:symbolic});
    assert.throws(()=>pm.import(snapshot));
    assert.deepEqual(pm.export(),before);
  }
});

test('the top-level memories accessor is rejected without invoking application code',()=>{
  const {pm,put}=setup();put({id:'one'});const before=pm.export(),snapshot=pm.export();
  let reads=0;
  Object.defineProperty(snapshot,'memories',{get(){reads++;return before.memories;},enumerable:true});
  assert.throws(()=>pm.import(snapshot));
  assert.equal(reads,0);assert.deepEqual(pm.export(),before);
});

test('dangling graph references must identify one slot, revision and predecessor/successor',()=>{
  const {pm,put}=setup();
  const a=put({id:'a'}),b=put({id:'b',key:'other'});
  const before=pm.export();
  const mutateCases=[
    snapshot=>{
      for(const id of [a.id,b.id]){
        snapshot.memories[id].status='superseded';snapshot.memories[id].supersededBy='missing';
      }
    },
    snapshot=>{
      snapshot.memories.b.key=snapshot.memories.a.key;
      for(const id of [a.id,b.id]){
        snapshot.memories[id].status='superseded';snapshot.memories[id].supersededBy='missing';
      }
    },
    snapshot=>{snapshot.memories.a.supersedes='missing';},
    snapshot=>{snapshot.memories.a.revision=2;},
  ];
  for(const mutate of mutateCases){
    const snapshot=structuredClone(before);mutate(snapshot);
    assert.throws(()=>pm.import(snapshot));assert.deepEqual(pm.export(),before);
  }
});

test('a pruned gap cannot reverse the chronology between retained neighbours',()=>{
  const {pm,put,at}=setup();
  const a=put({id:'a'});at(1010);
  const b=put({id:'b',replaceId:a.id,expiresAt:1025});at(1020);
  put({id:'c',replaceId:b.id});at(1025);pm.maintain();
  const before=pm.export(),bad=pm.export();
  Object.assign(bad.memories.c,{createdAt:1005,updatedAt:1005,observedAt:1005});
  assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
});

test('an invalid dangling-reference disk file is preserved for recovery',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-record-audit-'));
  t.after(()=>{
    const resolved=path.resolve(dir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(resolved).startsWith('pm-record-audit-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const {pm,put}=setup();put({id:'a'});put({id:'b',key:'other'});
  const bad=pm.export();
  for(const id of ['a','b'])Object.assign(bad.memories[id],{status:'superseded',supersededBy:'missing'});
  const file=path.join(dir,'default.json'),original=JSON.stringify(bad);
  fs.writeFileSync(file,original);
  assert.throws(()=>new PersonaMemory({storage:dir,clock:()=>1000}),/original file preserved/);
  assert.equal(fs.readFileSync(file,'utf8'),original);
});

test('mixed replay with recycled IDs, expiry gaps and forget-by-pruned-ID stays restorable',()=>{
  for(const initialSeed of [1729,92837,81271]){
    let now=1000,seed=initialSeed;
    const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
    const config={maxMemories:24},pm=new PersonaMemory({config,clock:()=>now});
    const ids=['a','b','c','d','e','f','g','h','toString','valueOf'],coverage=[0,0,0,0,0];
    for(let step=0;step<700;step++){
      now+=random(20)+1;
      const subject={type:['user','project','task'][random(3)],id:'s'+random(2)};
      const kind=['fact','constraint','state'][random(3)],key='field'+random(2);
      const before=pm.export();
      try{
        const operation=random(5);coverage[operation]++;
        switch(operation){
          case 0:case 1:{
            const previous=pm.listMemories({subject,kind,key})[0];
            pm.putMemory({id:ids[random(ids.length)],subject,kind,key,value:{step},
              ...(random(2)?{expiresAt:now+random(30)}:{}),...(previous?{replaceId:previous.id}:{})});
            break;
          }
          case 2:pm.maintain();break;
          case 3:pm.forgetMemory(ids[random(ids.length)]);break;
          case 4:pm.deleteSubject(subject);break;
        }
      }catch(error){
        assert.ok(['ERR_MEMORY_CONFLICT','ERR_MEMORY_CAPACITY'].includes(error.code),error.stack);
        assert.deepEqual(pm.export(),before);
      }
      const restored=new PersonaMemory({config,clock:()=>now});
      restored.import(pm.export());assert.deepEqual(restored.export(),pm.export());
      assert.ok(pm.diagnostics().memories<=24);
    }
    assert.ok(coverage.every(count=>count>50),JSON.stringify(coverage));
  }
});

test('a completely pruned ID returns zero; retained history can be forgotten by an explicit slot lookup',()=>{
  const {pm,put,at}=setup();
  const a=put({id:'a'});at(1010);
  const b=put({id:'b',replaceId:a.id,expiresAt:1040});at(1020);
  const c=put({id:'c',replaceId:b.id,expiresAt:1040});at(1040);pm.maintain();
  assert.equal(pm.forgetMemory(c.id).removed,0);
  const retained=pm.listMemories({subject,kind:'constraint',key:'release',includeInactive:true,limit:1});
  assert.equal(retained.length,1);assert.equal(retained[0].id,a.id);
  assert.equal(pm.forgetMemory(retained[0].id).removed,1);
  assert.equal(pm.diagnostics().memories,0);
});

for(const stage of ['write','rename'])test('failed disk '+stage+' preserves the old snapshot and remains retryable',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-disk-audit-'));
  const originals={write:fs.writeFileSync,rename:fs.renameSync};
  t.after(()=>{
    fs.writeFileSync=originals.write;fs.renameSync=originals.rename;
    const resolved=path.resolve(dir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(resolved).startsWith('pm-disk-audit-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  let now=1000;const pm=new PersonaMemory({storage:dir,clock:()=>now});
  const first=pm.putMemory({id:'first',subject,kind:'constraint',key:'release',value:'original'});pm.flush();
  const file=path.join(dir,'default.json'),prior=fs.readFileSync(file,'utf8');
  now++;
  const second=pm.putMemory({id:'second',subject,kind:'constraint',key:'release',value:'revised',replaceId:first.id});
  const fail=()=>Object.assign(new Error('simulated disk failure'),{code:'EIO'});
  if(stage==='write')fs.writeFileSync=function(target,...args){
    if(String(target).endsWith('.tmp')){originals.write.call(fs,target,'partial data');throw fail();}
    return originals.write.call(fs,target,...args);
  };
  else fs.renameSync=function(from,to){if(to===file)throw fail();return originals.rename.call(fs,from,to);};
  assert.throws(()=>pm.flush(),{code:'EIO'});
  assert.equal(fs.readFileSync(file,'utf8'),prior);
  assert.deepEqual(fs.readdirSync(dir),['default.json']);
  const old=new PersonaMemory({storage:dir,clock:()=>now});assert.equal(old.getMemory(first.id).value,'original');
  fs.writeFileSync=originals.write;fs.renameSync=originals.rename;
  pm.flush();
  const restored=new PersonaMemory({storage:dir,clock:()=>now});
  assert.equal(restored.getMemory(second.id).value,'revised');
  assert.deepEqual(restored.export(),pm.export());
});
