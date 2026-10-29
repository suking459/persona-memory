import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PersonaMemory,JsonFileStore,MemorySnapshotStore} from '../src/index.js';
const subject={type:'task',id:'work'};
const put=(pm,id)=>pm.putMemory({id,subject,kind:'fact',key:id,value:id});
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-store-'));
  t.after(()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('pm-store-'));fs.rmSync(resolved,{recursive:true,force:true});});return dir;
}
test('two stale default JSON writers cannot overwrite each other and can explicitly reload',async t=>{
  const dir=directory(t),a=new PersonaMemory({storage:dir}),b=new PersonaMemory({storage:dir});
  put(a,'a');a.flush();put(b,'b');const before=b.export();
  assert.throws(()=>b.flush(),{code:'ERR_STORE_CONFLICT'});assert.deepEqual(b.export(),before);
  assert.ok(new PersonaMemory({storage:dir}).getMemory('a'));
  await assert.rejects(b.reload(),{code:'ERR_STORE_DIRTY'});
  await b.reload({discardChanges:true});put(b,'b');b.flush();
  assert.deepEqual(new PersonaMemory({storage:dir}).listMemories({subject}).map(record=>record.id).sort(),['a','b']);
});
test('a file lock fails promptly without stealing or removing another writer lock',t=>{
  const dir=directory(t),pm=new PersonaMemory({storage:dir}),lock=path.join(dir,'default.json.lock');
  put(pm,'a');fs.writeFileSync(lock,'host owns this');
  assert.throws(()=>pm.flush(),{code:'ERR_STORE_LOCKED'});
  assert.equal(fs.readFileSync(lock,'utf8'),'host owns this');fs.unlinkSync(lock);
  pm.flush();assert.ok(new PersonaMemory({storage:dir}).getMemory('a'));
});
test('async memory store preserves detached snapshots and rejects stale writes',async()=>{
  const store=new MemorySnapshotStore(),a=await PersonaMemory.open({store}),b=await PersonaMemory.open({store});
  put(a,'a');await a.persist();put(b,'b');
  await assert.rejects(b.persist(),{code:'ERR_STORE_CONFLICT'});
  const loaded=await store.read();loaded.snapshot.memories.a.value='tampered';
  assert.equal((await store.read()).snapshot.memories.a.value,'a');
  await b.reload({discardChanges:true});put(b,'b');await b.persist();
  assert.equal((await PersonaMemory.open({store})).diagnostics().memories,2);
});
test('explicit async JSON store uses the same snapshot format and sync directory reader',async t=>{
  const dir=directory(t),store=new JsonFileStore({file:path.join(dir,'default.json')});
  const pm=await PersonaMemory.open({store});put(pm,'a');await pm.persist();
  assert.deepEqual(new PersonaMemory({storage:dir}).export(),pm.export());
});
test('changes during asynchronous persist remain dirty for the next explicit persist',async()=>{
  const backing=new MemorySnapshotStore();let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const store={read:()=>backing.read(),async write(snapshot,options){started();await new Promise(resolve=>{release=resolve;});return backing.write(snapshot,options);}};
  const pm=await PersonaMemory.open({store});put(pm,'a');
  const saving=pm.persist();await ready;put(pm,'b');release();await saving;
  assert.equal(pm._dirty,true);assert.equal((await backing.read()).snapshot.memories.b,undefined);
  store.write=(snapshot,options)=>backing.write(snapshot,options);await pm.persist();
  assert.equal(pm._dirty,false);assert.ok((await backing.read()).snapshot.memories.b);
});
test('overlapping operations and reloads cannot discard changes made during an await',async()=>{
  const backing=new MemorySnapshotStore();let release;const store={write:(...args)=>backing.write(...args),read:()=>backing.read()};
  const pm=await PersonaMemory.open({store});
  store.read=()=>new Promise(resolve=>{release=async()=>resolve(await backing.read());});
  const loading=pm.reload();put(pm,'a');await assert.rejects(pm.persist(),{code:'ERR_STORE_BUSY'});
  await assert.rejects(pm.reload({discardChanges:true}),{code:'ERR_STORE_BUSY'});
  await release();await assert.rejects(loading,{code:'ERR_STORE_DIRTY'});assert.ok(pm.getMemory('a'));
});
test('async store errors preserve local state and leave persistence retryable',async()=>{
  const backing=new MemorySnapshotStore();let fail=true;
  const store={read:()=>backing.read(),write:(snapshot,options)=>{if(fail)throw new Error('offline');return backing.write(snapshot,options);}};
  const pm=await PersonaMemory.open({store});put(pm,'a');const before=pm.export();
  await assert.rejects(pm.persist(),/offline/);assert.deepEqual(pm.export(),before);assert.equal(pm._dirty,true);
  fail=false;await pm.persist();assert.equal(pm._dirty,false);
});
test('invalid store responses and identity mismatch cannot replace a valid in-memory state',async()=>{
  const pm=await PersonaMemory.open({store:new MemorySnapshotStore()});put(pm,'a');await pm.persist();const before=pm.export();
  pm._store={read:async()=>({snapshot:{...before,scope:'other'},revision:'remote'}),write:async()=>({revision:'remote'})};
  await assert.rejects(pm.reload());assert.deepEqual(pm.export(),before);
  pm._store.read=async()=>({snapshot:null,revision:'impossible'});
  await assert.rejects(pm.reload());assert.deepEqual(pm.export(),before);
});
test('sync flush gives an explicit error for an async-only store, while maintenance stays usable',async()=>{
  const pm=await PersonaMemory.open({store:new MemorySnapshotStore(),clock:()=>1000});
  put(pm,'a');assert.throws(()=>pm.flush(),{code:'ERR_STORE_ASYNC'});
  assert.equal(pm.maintain().memoriesExpired,0);await pm.persist();
});
