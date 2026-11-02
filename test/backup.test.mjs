import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PersonaMemory,MemorySnapshotStore,SQLiteSnapshotStore,createMemoryBackup,inspectMemoryBackup,previewMemoryRestore,restoreMemoryBackup} from '../src/index.js';
import {prepareAgentBundle,openAgentMemory,createAgentSession} from '../adapters/agent/index.js';
import {connectCommand} from '../tools/connect.mjs';
import {readBackupJSON} from '../adapters/agent/backup.js';
const subject={type:'project',id:'p'},base=fileURLToPath(new URL('../.artifacts/',import.meta.url));
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'backup-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const put=(pm,id='a',extra={})=>pm.putMemory({id,subject,kind:'fact',key:id,value:'中文 Français العربية 🌏',...extra});
const setup=async()=>{const pm=new PersonaMemory({clock:()=>1000}),a=put(pm);put(pm,'summary',{derivedFrom:[{id:a.id,revision:a.revision}]});return {pm,backup:await createMemoryBackup(pm,{now:1000})};};
test('full backup preserves derived sources and original multilingual values with detached checksum',async()=>{
  const {pm,backup}=await setup(),inspected=inspectMemoryBackup(backup);assert.equal(inspected.counts.memories,2);
  const restored=new PersonaMemory({clock:()=>1000}),plan=await previewMemoryRestore(restored,backup,{now:1000});
  assert.deepEqual(plan.restoring,{memories:2,candidates:0,relationshipProfiles:0});assert.equal(restored.diagnostics().memories,0);
  assert.equal((await restoreMemoryBackup(restored,backup,plan,{now:1001})).committed,true);assert.deepEqual(restored.export(),pm.export());
  const impact=restored.previewForgetMemory('a');assert.deepEqual(impact.recordIds.sort(),['a','summary']);
  backup.snapshot.memories.a.value='tampered';assert.equal(pm.getMemory('a').value,'中文 Français العربية 🌏');
});
test('checksum corruption, unknown fields and malicious accessors fail without callbacks',async()=>{
  const {backup}=await setup(),bad=structuredClone(backup);bad.snapshot.memories.a.value='damaged';assert.throws(()=>inspectMemoryBackup(bad),{code:'ERR_BACKUP_CHECKSUM'});
  assert.throws(()=>inspectMemoryBackup({...backup,extra:true}),/invalid/);let calls=0;
  assert.throws(()=>inspectMemoryBackup({get format(){calls++;return 'x';}}));assert.equal(calls,0);
});
test('dirty durable memory must be persisted before backup or restore previews',async()=>{
  const pm=await PersonaMemory.open({store:new MemorySnapshotStore()});put(pm);
  await assert.rejects(createMemoryBackup(pm),{code:'ERR_STORE_DIRTY'});
  const source=new PersonaMemory(),backup=await createMemoryBackup(source);
  await assert.rejects(previewMemoryRestore(pm,backup),{code:'ERR_STORE_DIRTY'});assert.ok(pm.getMemory('a'));
});
test('restoring an old-format snapshot upgrades in memory without rewriting the backup',async()=>{
  const {createHash}=await import('node:crypto');
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const payload={format:'persona-memory-backup',version:1,createdAt:1000,snapshot:{schemaVersion:1,persona:'default',scope:'',sessions:{}}};
  const backup={...payload,checksum:createHash('sha256').update(canonical(payload)).digest('hex')};
  const before=JSON.stringify(backup);assert.equal(inspectMemoryBackup(backup).snapshot.schemaVersion,6);assert.equal(JSON.stringify(backup),before);
});
test('wrong persona or namespace cannot silently relabel backup records',async()=>{
  const {backup}=await setup();
  for(const options of [{persona:'other'},{scope:'other'}])await assert.rejects(previewMemoryRestore(new PersonaMemory(options),backup),/mismatch/);
});
test('restore preview rejects expired, future, changed and hand-edited plans',async()=>{
  const {backup}=await setup(),pm=new PersonaMemory(),plan=await previewMemoryRestore(pm,backup,{now:1000});
  for(const now of [999,601000])await assert.rejects(restoreMemoryBackup(pm,backup,plan,{now}),{code:'ERR_RESTORE_EXPIRED'});
  await assert.rejects(restoreMemoryBackup(pm,backup,{...plan,targetDigest:'x'},{now:1001}),/invalid restore/);
  const other=await createMemoryBackup(new PersonaMemory(),{now:1000});
  await assert.rejects(restoreMemoryBackup(pm,other,plan,{now:1001}),{code:'ERR_RESTORE_CHANGED'});
});
test('a memory-only target edited after preview is preserved',async()=>{
  const {backup}=await setup(),pm=new PersonaMemory(),plan=await previewMemoryRestore(pm,backup,{now:1000});put(pm,'local');const before=pm.export();
  await assert.rejects(restoreMemoryBackup(pm,backup,plan,{now:1001}),{code:'ERR_RESTORE_CHANGED'});assert.deepEqual(pm.export(),before);
});
test('an external durable write after preview is refreshed and refuses restore',async()=>{
  const {backup}=await setup(),store=new MemorySnapshotStore(),a=await PersonaMemory.open({store}),b=await PersonaMemory.open({store}),plan=await previewMemoryRestore(a,backup,{now:1000});
  put(b,'external');await b.persist();await assert.rejects(restoreMemoryBackup(a,backup,plan,{now:1001}),{code:'ERR_RESTORE_CHANGED'});
  assert.ok((await PersonaMemory.open({store})).getMemory('external'));
});
test('a write racing the final CAS cannot be overwritten by a restore',async()=>{
  const {backup}=await setup(),backing=new MemorySnapshotStore(),other=new PersonaMemory();put(other,'external');
  let race=false;const store={read:()=>backing.read(),async write(snapshot,o){if(race){await backing.write(other.export(),o);}return backing.write(snapshot,o);}};
  const pm=await PersonaMemory.open({store}),plan=await previewMemoryRestore(pm,backup,{now:1000});race=true;
  await assert.rejects(restoreMemoryBackup(pm,backup,plan,{now:1001}),{code:'ERR_STORE_CONFLICT'});assert.equal(pm.diagnostics().memories,0);
  assert.ok((await PersonaMemory.open({store:backing})).getMemory('external'));
});
test('write failure leaves live state unchanged and issues no success receipt',async()=>{
  const {backup}=await setup(),store={async read(){return {snapshot:null,revision:null};},async write(){throw new Error('offline');}},pm=await PersonaMemory.open({store});
  const plan=await previewMemoryRestore(pm,backup,{now:1000});await assert.rejects(restoreMemoryBackup(pm,backup,plan,{now:1001}),/offline/);
  assert.equal(pm.diagnostics().memories,0);assert.equal(pm._storeBusy,false);
});
test('new local changes during awaited restore are retained and reported as requiring reload',async()=>{
  const {backup}=await setup(),backing=new MemorySnapshotStore();let release,begin;
  const ready=new Promise(r=>begin=r),store={read:()=>backing.read(),async write(s,o){begin();await new Promise(r=>release=r);return backing.write(s,o);}};
  const pm=await PersonaMemory.open({store}),plan=await previewMemoryRestore(pm,backup,{now:1000}),saving=restoreMemoryBackup(pm,backup,plan,{now:1001});
  await ready;put(pm,'local');release();const result=await saving;
  assert.equal(result.committed,true);assert.equal(result.requiresReload,true);assert.ok(pm.getMemory('local'));
  assert.ok((await PersonaMemory.open({store:backing})).getMemory('summary'));assert.equal(pm._dirty,true);
});
test('restoring to JSON is durable, invalidates previews, and cannot repeat a stale plan',async t=>{
  const {backup}=await setup(),pm=new PersonaMemory({storage:directory(t),clock:()=>1000}),plan=await previewMemoryRestore(pm,backup,{now:1000});
  const result=await restoreMemoryBackup(pm,backup,plan,{now:1001});assert.equal(result.requiresReload,false);assert.equal(pm._dirty,false);
  assert.ok(new PersonaMemory({storage:pm.storage,clock:()=>1000}).getMemory('summary'));
  await assert.rejects(restoreMemoryBackup(pm,backup,plan,{now:1002}),{code:'ERR_RESTORE_CHANGED'});
});
test('owner backup and cross-path JSON migration preserve subject identities and pending review',async t=>{
  const dir=directory(t),a=prepareAgentBundle({host:'dsh',out:path.join(dir,'old'),project:dir}),pm=openAgentMemory(a.binding),session=createAgentSession(pm,a.binding);
  await session.call('memory_propose',{scope:'project',kind:'fact',key:'color',value:'蓝色',evidenceId:'turn',reason:'request'});
  const backup=path.join(dir,'portable.json');await connectCommand(['backup','--binding',path.join(a.directory,'binding.json'),'--out',backup]);
  const payload=readBackupJSON(backup);assert.equal(payload.identity.namespace,a.binding.namespace);assert.equal(JSON.stringify(payload).includes(a.binding.storage),false);
  const second=path.join(dir,'different');fs.mkdirSync(second);
  const b=await connectCommand(['prepare','--host','claude-code','--project',second,'--out',path.join(dir,'new'),'--identity-from',backup]);
  assert.equal(b.binding.namespace,a.binding.namespace);assert.equal(b.binding.access,'capture');assert.deepEqual(b.binding.subjects,a.binding.subjects);
  const binding=path.join(b.directory,'binding.json'),plan=path.join(dir,'restore.json');
  const preview=await connectCommand(['restore-preview','--binding',binding,'--backup',backup,'--out',plan]);assert.equal(preview.previewOnly,true);assert.equal(fs.existsSync(b.binding.storage),false);
  await connectCommand(['restore-apply','--binding',binding,'--backup',backup,'--plan',plan]);assert.equal(openAgentMemory(b.binding).listCandidates({subject:b.binding.subjects.project,status:'pending'}).length,1);
  await assert.rejects(connectCommand(['backup','--binding',binding,'--out',backup]),{code:'EEXIST'});
});
test('CLI restore plan cannot be applied to another binding or after source changes',async t=>{
  const dir=directory(t),a=prepareAgentBundle({host:'dsh',out:path.join(dir,'one'),project:dir}),binding=path.join(a.directory,'binding.json'),backup=path.join(dir,'backup.json'),plan=path.join(dir,'plan.json');
  await connectCommand(['backup','--binding',binding,'--out',backup]);await connectCommand(['restore-preview','--binding',binding,'--backup',backup,'--out',plan]);
  const altered={...a.binding,storage:path.join(dir,'other')};fs.writeFileSync(path.join(dir,'other.json'),JSON.stringify(altered));
  await assert.rejects(connectCommand(['restore-apply','--binding',path.join(dir,'other.json'),'--backup',backup,'--plan',plan]),/different binding/);assert.equal(fs.existsSync(altered.storage),false);
  fs.writeFileSync(backup,'{}');await assert.rejects(connectCommand(['restore-apply','--binding',binding,'--backup',backup,'--plan',plan]),/unsupported/);
});
test('backup file reading rejects malformed UTF-8, excessive sizes, directories and symbolic entries',t=>{
  const dir=directory(t),file=path.join(dir,'bad.json');fs.writeFileSync(file,Buffer.from([0xff]));assert.throws(()=>readBackupJSON(file));
  fs.writeFileSync(file,' '.repeat(100));assert.throws(()=>readBackupJSON(file,32),/bounded/);assert.throws(()=>readBackupJSON(dir),/regular/);
  const link=path.join(dir,'link');fs.symlinkSync(dir,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>readBackupJSON(link),/regular/);
});
const [major,minor]=process.versions.node.split('.').map(Number);
if(major>22||major===22&&minor>=13){
  test('JSON to SQLite to JSON backup migration preserves provenance and independent review state',async t=>{
    const dir=directory(t),{backup}=await setup(),store=new SQLiteSnapshotStore({file:path.join(dir,'memory.sqlite')}),pm=new PersonaMemory({store,clock:()=>1000});
    await restoreMemoryBackup(pm,backup,await previewMemoryRestore(pm,backup,{now:1000}),{now:1001});
    const reopened=new PersonaMemory({store,clock:()=>1000}),again=await createMemoryBackup(reopened,{now:1002}),json=new PersonaMemory({storage:path.join(dir,'json'),clock:()=>1000});
    await restoreMemoryBackup(json,again,await previewMemoryRestore(json,again,{now:1002}),{now:1003});assert.deepEqual(json.export(),reopened.export());
    json.forgetMemory('a');json.flush();assert.equal(new PersonaMemory({storage:json.storage}).getMemory('summary'),null);
  });
}
test('core snapshot export bounds data and never invokes a getter or toJSON callback',()=>{
  const pm=new PersonaMemory();let calls=0;Object.defineProperty(pm.state,'malicious',{enumerable:true,get(){calls++;return 1;}});
  assert.throws(()=>pm.export());assert.equal(calls,0);
});

test('synchronous constructor rejects inconsistent and async-only store contracts',()=>{
  const store={readSync(){return {snapshot:null,revision:'nonempty'};},writeSync(){return {revision:'x'};},async read(){return this.readSync();},async write(){return {revision:'x'};}};
  assert.throws(()=>new PersonaMemory({store}),/original file preserved/);
  assert.throws(()=>new PersonaMemory({store:new MemorySnapshotStore()}),/synchronous store/);
  assert.throws(()=>new PersonaMemory({storage:'somewhere',store}),/choose/);
});
