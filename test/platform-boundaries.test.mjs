import {copySnapshotJSON} from '../src/snapshot.js';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory,JsonFileStore} from '../src/index.js';
const subject={type:'project',id:'boundary'};
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-platform-'));t.after(()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('pm-platform-'));fs.rmSync(resolved,{recursive:true,force:true});});return dir;}
test('invalid UTF-8 in a JSON snapshot is rejected rather than silently replaced',t=>{
  const dir=directory(t),pm=new PersonaMemory();pm.putMemory({subject,kind:'fact',key:'text',value:'valid'});
  const data=Buffer.from(JSON.stringify(pm.export())),at=data.indexOf(Buffer.from('"valid"'));assert.ok(at>=0);data[at+1]=0x80;
  const file=path.join(dir,'default.json');fs.writeFileSync(file,data);
  assert.throws(()=>new PersonaMemory({storage:dir}),/original file preserved/);assert.deepEqual(fs.readFileSync(file),data);
});
test('snapshot read budget still bounds bytes if the file grows after its metadata check',t=>{
  const dir=directory(t),file=path.join(dir,'data.json'),data=JSON.stringify({value:'x'.repeat(100000)});fs.writeFileSync(file,data);
  const store=new JsonFileStore({file,maxBytes:1024}),originals={open:fs.openSync,stat:fs.fstatSync,read:fs.readSync,readFile:fs.readFileSync};let fd,readBytes=0;
  t.after(()=>{fs.openSync=originals.open;fs.fstatSync=originals.stat;fs.readSync=originals.read;fs.readFileSync=originals.readFile;});
  fs.openSync=function(target,...args){const opened=originals.open.call(fs,target,...args);if(target===file)fd=opened;return opened;};
  fs.fstatSync=function(target,...args){const stat=originals.stat.call(fs,target,...args);if(target===fd)stat.size=0;return stat;};
  fs.readSync=function(target,...args){const n=originals.read.call(fs,target,...args);if(target===fd)readBytes+=n;return n;};
  fs.readFileSync=function(target,...args){const result=originals.readFile.call(fs,target,...args);if(target===fd)readBytes+=Buffer.byteLength(result);return result;};
  assert.throws(()=>store.readSync());assert.ok(readBytes<=1025,'read beyond budget: '+readBytes);
});
test('non-regular snapshot targets are rejected before a potentially blocking open',t=>{
  const dir=directory(t),file=path.join(dir,'data.json');fs.writeFileSync(file,'{}');
  const store=new JsonFileStore({file}),original=fs.lstatSync;t.after(()=>{fs.lstatSync=original;});
  fs.lstatSync=function(target,...args){if(target===file)return {isFile:()=>false,isSymbolicLink:()=>false};return original.call(fs,target,...args);};
  assert.throws(()=>store.readSync(),/regular file/);
});
test('temporary-name collision cannot delete an existing file owned by another writer',t=>{
  const dir=directory(t),file=path.join(dir,'data.json'),store=new JsonFileStore({file});
  const originals={open:fs.openSync,write:fs.writeFileSync};let foreign;
  t.after(()=>{fs.openSync=originals.open;fs.writeFileSync=originals.write;});
  const collision=target=>{foreign=String(target);const fd=originals.open.call(fs,foreign,'wx',0o600);try{originals.write.call(fs,fd,'foreign data');}finally{fs.closeSync(fd);}return Object.assign(new Error('simulated collision'),{code:'EEXIST'});};
  fs.openSync=function(target,...args){if(String(target).endsWith('.tmp'))throw collision(target);return originals.open.call(fs,target,...args);};
  fs.writeFileSync=function(target,...args){if(typeof target==='string'&&target.endsWith('.tmp'))throw collision(target);return originals.write.call(fs,target,...args);};
  assert.throws(()=>store.writeSync({value:'new'},{expectedRevision:null}),{code:'EEXIST'});
  fs.openSync=originals.open;fs.writeFileSync=originals.write;
  assert.ok(foreign);assert.equal(fs.readFileSync(foreign,'utf8'),'foreign data');
});
test('a lock already removed after commit does not turn a successful save into a failure',t=>{
  const dir=directory(t),file=path.join(dir,'data.json'),store=new JsonFileStore({file}),rename=fs.renameSync;
  t.after(()=>{fs.renameSync=rename;});
  fs.renameSync=function(from,to){const result=rename.call(fs,from,to);if(to===file)fs.unlinkSync(file+'.lock');return result;};
  const result=store.writeSync({value:'saved'},{expectedRevision:null});
  assert.equal(store.readSync().revision,result.revision);assert.equal(store.readSync().snapshot.value,'saved');
});
test('snapshot import never invokes a top-level data accessor',()=>{
  const pm=new PersonaMemory(),before=pm.export(),snapshot=pm.export();let reads=0;
  Object.defineProperty(snapshot,'sessions',{enumerable:true,get(){reads++;return before.sessions;}});
  assert.throws(()=>pm.import(snapshot));assert.equal(reads,0);assert.deepEqual(pm.export(),before);
});
test('snapshot import never invokes nested accessors or toJSON methods',()=>{
  for(const method of [false,true]){
    const pm=new PersonaMemory(),before=pm.export(),snapshot=pm.export();let reads=0;
    snapshot.history=[{at:1000,payload:method?{toJSON(){reads++;return 'executed';}}:{get value(){reads++;return 'executed';}}}];
    assert.throws(()=>pm.import(snapshot));assert.equal(reads,0);assert.deepEqual(pm.export(),before);
  }
});
test('direct snapshot import respects its byte budget before discarding unknown fields',()=>{
  const pm=new PersonaMemory({config:{maxSnapshotBytes:1024}}),before=pm.export(),snapshot=pm.export();snapshot.unused='x'.repeat(3000);
  assert.throws(()=>pm.import(snapshot),{code:'ERR_MEMORY_CAPACITY'});assert.deepEqual(pm.export(),before);
});
test('excessively deep snapshot data is rejected before JSON serialization',()=>{
  const pm=new PersonaMemory(),before=pm.export(),snapshot=pm.export();let nested={};snapshot.unused=nested;
  for(let i=0;i<64;i++){nested.next={};nested=nested.next;}
  assert.throws(()=>pm.import(snapshot));assert.deepEqual(pm.export(),before);
});

if(process.platform==='linux'){
  test('Linux FIFO snapshot paths fail inside a child watchdog instead of blocking open',t=>{
    const dir=directory(t),fifo=path.join(dir,'fifo.json');const made=spawnSync('mkfifo',[fifo],{encoding:'utf8'});assert.equal(made.status,0,made.stderr);
    const moduleURL=new URL('../src/storage.js',import.meta.url).href;
    const script='import {JsonFileStore} from '+JSON.stringify(moduleURL)+';try{new JsonFileStore({file:process.argv[1]}).readSync();process.exitCode=2;}catch(error){if(!/regular file/.test(error.message))throw error;}';
    const result=spawnSync(process.execPath,['--input-type=module','-e',script,fifo],{timeout:10000,encoding:'utf8'});
    assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  });
  test('Linux snapshot symlinks are rejected and their targets stay unchanged',t=>{
    const dir=directory(t),target=path.join(dir,'target.json'),link=path.join(dir,'linked.json');fs.writeFileSync(target,'{"private":"synthetic"}');fs.symlinkSync(target,link);
    assert.throws(()=>new JsonFileStore({file:link}).readSync(),/regular file/);assert.equal(fs.readFileSync(target,'utf8'),'{"private":"synthetic"}');
  });
  test('Linux read-only directories refuse a save while preserving the valid prior snapshot',t=>{
    if(process.getuid?.()===0){t.skip('requires a non-root permission boundary');return;}
    const dir=directory(t),file=path.join(dir,'data.json'),store=new JsonFileStore({file});const saved=store.writeSync({value:'old'},{expectedRevision:null});
    fs.chmodSync(dir,0o500);
    try{assert.throws(()=>store.writeSync({value:'new'},{expectedRevision:saved.revision}),{code:'EACCES'});assert.equal(store.readSync().snapshot.value,'old');}
    finally{fs.chmodSync(dir,0o700);}
  });
}

test('snapshot byte accounting matches JSON for Unicode, escapes and finite numeric forms',()=>{
  const values=[null,true,false,0,-0,1e21,1e-7,'汉字😀','quotes" and slash\\','\u0000\b\t\n\f\r','\ud800','\udfff',{['汉😀']:'\u0001',array:['é','e\u0301',123]}];
  for(const value of values){const size=Buffer.byteLength(JSON.stringify(value));assert.deepEqual(copySnapshotJSON(value,size),value);assert.throws(()=>copySnapshotJSON(value,size-1),{code:'ERR_MEMORY_CAPACITY'});}
});

test('candidate validation does not consume the independent formal-memory capacity',()=>{
  const config={maxMemories:0},pm=new PersonaMemory({config,clock:()=>1000});
  const candidate=pm.proposeMemory({memory:{subject,kind:'fact',key:'review',value:'pending only',evidenceId:'host-message'}});
  assert.equal(pm.diagnostics().memories,0);assert.equal(pm.diagnostics().candidates,1);
  const copy=new PersonaMemory({config,clock:()=>1000});copy.import(pm.export());assert.deepEqual(copy.export(),pm.export());
  const before=copy.export();assert.throws(()=>copy.acceptCandidate(candidate.id,{expectedRevision:1}),{code:'ERR_MEMORY_CAPACITY'});assert.deepEqual(copy.export(),before);
});

test('custom stores validate snapshot data before serialization or invoking hooks',async()=>{
  for(const hook of ['getter','toJSON']){
    let loaded={snapshot:null,revision:null},executed=0;
    const store={async read(){return loaded;},async write(){throw Error('unexpected write');}};
    const pm=await PersonaMemory.open({store,clock:()=>1000});
    pm.putMemory({subject,kind:'fact',key:'local',value:'keep'});
    const before=pm.export(),snapshot=pm.export();
    if(hook==='getter')Object.defineProperty(snapshot,'sessions',{enumerable:true,get(){executed++;return {};}});
    else snapshot.unused={toJSON(){executed++;return 'executed';}};
    loaded={snapshot,revision:'synthetic'};
    await assert.rejects(pm.reload({discardChanges:true}));
    assert.equal(executed,0,hook+' executed before validation');assert.deepEqual(pm.export(),before);
    loaded={snapshot:before,revision:'safe'};
    await pm.reload({discardChanges:true});assert.deepEqual(pm.export(),before);
  }
});

test('custom store reload bounds complete snapshot bytes and depth atomically',async()=>{
  let loaded={snapshot:null,revision:null};
  const store={async read(){return loaded;},async write(){throw Error('unexpected write');}};
  const pm=await PersonaMemory.open({store,config:{maxSnapshotBytes:1024}}),before=pm.export();
  const deep={};let cursor=deep;for(let i=0;i<40;i++){cursor.next={};cursor=cursor.next;}
  for(const unused of ['x'.repeat(3000),deep]){
    loaded={snapshot:{...before,unused},revision:'synthetic'};
    await assert.rejects(pm.reload(),{code:'ERR_MEMORY_CAPACITY'});assert.deepEqual(pm.export(),before);
  }
});
