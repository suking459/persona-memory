import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {PersonaMemory,SQLiteSnapshotStore} from '../src/index.js';
import {prepareAgentBundle,openAgentMemory,createAgentSession,inspectAgentCandidates} from '../adapters/agent/index.js';
import {testTimeout} from '../tools/test-limits.mjs';
const base=fileURLToPath(new URL('../.artifacts/',import.meta.url)),subject={type:'project',id:'p'};
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'sqlite-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const put=(pm,id='a')=>pm.putMemory({id,subject,kind:'fact',key:id,value:'中文 العربية 日本語 🌍'});
const [major,minor]=process.versions.node.split('.').map(Number),available=major>22||major===22&&minor>=13;
if(!available){
  test('optional SQLite import works on old Node; explicit use fails without creating files',t=>{
    const file=path.join(directory(t),'missing','db.sqlite');
    assert.throws(()=>new SQLiteSnapshotStore({file}),{code:'ERR_SQLITE_UNAVAILABLE'});assert.equal(fs.existsSync(path.dirname(file)),false);
    const pm=new PersonaMemory();put(pm);assert.ok(pm.getMemory('a'));
  });
}else{
  const native=createRequire(import.meta.url)('node:sqlite'),Database=native.Database??native.DatabaseSync;
  const setup=t=>{const dir=directory(t),file=path.join(dir,'记忆.sqlite'),store=new SQLiteSnapshotStore({file});return {dir,file,store};};
  test('SQLite missing reads do not create directories; first CAS write reloads Unicode exactly',t=>{
    const dir=directory(t),file=path.join(dir,'nested','记忆.sqlite'),store=new SQLiteSnapshotStore({file});
    assert.deepEqual(store.readSync(),{snapshot:null,revision:null});assert.equal(fs.existsSync(path.dirname(file)),false);
    const pm=new PersonaMemory({store});put(pm);pm.flush();assert.equal(new PersonaMemory({store}).getMemory('a').value,'中文 العربية 日本語 🌍');assert.equal(pm._dirty,false);
  });
  test('SQLite stale writers refuse overwrites and explicit reload recovers',async t=>{
    const {store}=setup(t),a=new PersonaMemory({store}),b=new PersonaMemory({store});put(a);await a.persist();put(b,'b');
    assert.throws(()=>b.flush(),{code:'ERR_STORE_CONFLICT'});assert.ok(b.getMemory('b'));await b.reload({discardChanges:true});put(b,'b');await b.persist();assert.equal(new PersonaMemory({store}).listMemories({subject}).length,2);
  });
  test('SQLite parameterized namespace keys cannot become SQL; namespace capacity is bounded',t=>{
    const {file}=setup(t),a=new SQLiteSnapshotStore({file,namespace:"x'); DROP TABLE pm_snapshots;--",maxNamespaces:2}),b=new SQLiteSnapshotStore({file,namespace:'two',maxNamespaces:2});
    a.writeSync({a:1},{expectedRevision:null});b.writeSync({b:2},{expectedRevision:null});
    assert.deepEqual(a.readSync().snapshot,{a:1});assert.deepEqual(b.readSync().snapshot,{b:2});
    assert.throws(()=>new SQLiteSnapshotStore({file,namespace:'three',maxNamespaces:2}).writeSync({c:3},{expectedRevision:null}),{code:'ERR_STORE_CAPACITY'});
  });
  test('foreign SQLite database is rejected without changing its bytes or tables',t=>{
    const {file,store}=setup(t),db=new Database(file);db.exec('CREATE TABLE personal(secret TEXT); INSERT INTO personal VALUES(\'private\')');db.close();
    const before=fs.readFileSync(file);assert.throws(()=>store.readSync(),{code:'ERR_SQLITE_IDENTITY'});assert.throws(()=>store.writeSync({x:1},{expectedRevision:null}),{code:'ERR_SQLITE_IDENTITY'});
    assert.deepEqual(fs.readFileSync(file),before);
  });
  test('unclaimed pre-existing empty files are preserved rather than silently adopted',t=>{
    const {file,store}=setup(t);fs.writeFileSync(file,'');assert.throws(()=>store.writeSync({x:1},{expectedRevision:null}),{code:'ERR_SQLITE_IDENTITY'});assert.equal(fs.statSync(file).size,0);
  });
  test('altered store schemas and triggers are rejected before any application mutation',t=>{
    const {file,store}=setup(t);store.writeSync({x:1},{expectedRevision:null});const db=new Database(file);
    db.exec("CREATE TRIGGER unexpected AFTER INSERT ON pm_snapshots BEGIN SELECT 1; END;");db.close();const before=fs.readFileSync(file);
    assert.throws(()=>store.readSync(),{code:'ERR_SQLITE_IDENTITY'});assert.deepEqual(fs.readFileSync(file),before);
  });
  test('SQLite snapshot limits are checked before creating files and before materializing stored JSON',t=>{
    const {file}=setup(t),small=new SQLiteSnapshotStore({file,maxBytes:1024});
    assert.throws(()=>small.writeSync({large:'x'.repeat(5000)},{expectedRevision:null}));assert.equal(fs.existsSync(file),false);
    const large=new SQLiteSnapshotStore({file});large.writeSync({large:'x'.repeat(5000)},{expectedRevision:null});assert.throws(()=>small.readSync(),/byte limit/);
  });
  test('SQLite rejects accessors and toJSON without invoking them',t=>{
    const {store}=setup(t);let calls=0;
    assert.throws(()=>store.writeSync({get x(){calls++;return 1;}},{expectedRevision:null}));
    assert.throws(()=>store.writeSync({toJSON(){calls++;return {};}},{expectedRevision:null}));assert.equal(calls,0);
  });
  test('SQLite rejects links, directories, invalid revisions and reserved devices',t=>{
    const {dir,file,store}=setup(t);fs.mkdirSync(file);assert.throws(()=>store.readSync(),{code:'ERR_STORE_FILE'});
    fs.rmdirSync(file);const target=path.join(dir,'target');if(process.platform==='win32'){fs.mkdirSync(target);fs.symlinkSync(target,file,'junction');}else{fs.writeFileSync(target,'private');fs.symlinkSync(target,file);}
    assert.throws(()=>store.readSync(),{code:'ERR_STORE_FILE'});assert.equal(fs.existsSync(target),true);
    assert.throws(()=>store.writeSync({x:1},{}),/revision/);
    for(const name of ['NUL','CON.db','COM1.sqlite'])assert.throws(()=>new SQLiteSnapshotStore({file:path.join(dir,name)}),/device/);
  });
  test('SQLite active writer lock fails promptly and does not steal the transaction',{timeout:testTimeout(10000)},async t=>{
    const {file,store}=setup(t);const saved=store.writeSync({value:'old'},{expectedRevision:null});
    const code="const s=require('node:sqlite'),db=new (s.Database??s.DatabaseSync)(process.argv[1]);db.exec('BEGIN IMMEDIATE');process.stdout.write('ready\\n');setInterval(()=>{},1000);";
    const child=spawn(process.execPath,['-e',code,file],{stdio:['ignore','pipe','pipe'],windowsHide:true});t.after(()=>{if(child.exitCode===null)child.kill();});
    await once(child.stdout,'data');const start=Date.now();
    assert.throws(()=>store.writeSync({value:'new'},{expectedRevision:saved.revision}),{code:'ERR_STORE_LOCKED'});assert.ok(Date.now()-start<testTimeout(1000));
    const exit=once(child,'exit');child.kill();await exit;assert.deepEqual(store.readSync().snapshot,{value:'old'});
  });
  test('a subprocess exiting mid-transaction cannot leave a half-written snapshot',t=>{
    const {file,store}=setup(t);store.writeSync({value:'old'},{expectedRevision:null});
    const code="const s=require('node:sqlite'),db=new (s.Database??s.DatabaseSync)(process.argv[1]);db.exec(\"BEGIN IMMEDIATE; UPDATE pm_snapshots SET snapshot='broken';\");process.exit(0);";
    const child=spawnSync(process.execPath,['-e',code,file],{windowsHide:true,encoding:'utf8',timeout:testTimeout(5000)});
    assert.equal(child.status,0,child.stderr);assert.deepEqual(store.readSync().snapshot,{value:'old'});
  });
  test('SQLite Agent capture and independent owner review share durable scoped state',async t=>{
    const dir=directory(t),bundle=prepareAgentBundle({host:'dsh',out:path.join(dir,'bundle'),project:dir,backend:'sqlite'}),b=bundle.binding;
    assert.equal(fs.existsSync(b.storage),false);
    const agent=createAgentSession(openAgentMemory(b),b),owner=createAgentSession(openAgentMemory(b),{...b,access:'review'});
    const p=await agent.call('memory_propose',{scope:'project',kind:'fact',key:'language',value:'日本語',evidenceId:'t1',reason:'request'});
    assert.equal(inspectAgentCandidates(b,{scope:'project'}).candidates.length,1);
    await owner.call('memory_review',{scope:'project',candidateId:p.candidate.id,expectedRevision:1,decision:'accept'});
    assert.equal((await agent.call('memory_recall',{scope:'project',query:'language'})).matches[0].record.value,'日本語');
    assert.throws(()=>createAgentSession(new PersonaMemory({storage:b.storage,persona:b.persona,scope:b.namespace}),b),/matching persistent/);
  });

  test('real SQLite MCP subprocess persists proposals and a restarted process reads owner acceptance',async t=>{
    const dir=directory(t),b=prepareAgentBundle({host:'codex',out:path.join(dir,'mcp'),project:dir,backend:'sqlite'}),file=path.join(b.directory,'binding.json');
    const rpc=(method,params,id)=>({jsonrpc:'2.0',id,method,params});
    const run=request=>{
      const child=spawnSync(process.execPath,['adapters/agent/server.js','--binding',file],{cwd:path.dirname(base.slice(0,-1)),input:[rpc('initialize',{protocolVersion:'2025-11-25'},1),rpc('tools/call',request,2)].map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
      assert.equal(child.status,0,child.stderr);const responses=child.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(responses[1].result.isError,undefined);return responses[1].result.structuredContent;
    };
    const p=run({name:'memory_propose',arguments:{scope:'project',kind:'fact',key:'greeting',value:'مرحبا',evidenceId:'t1',reason:'request'}});
    const owner=createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'review'});
    await owner.call('memory_review',{scope:'project',candidateId:p.candidate.id,expectedRevision:1,decision:'accept'});
    assert.equal(run({name:'memory_recall',arguments:{scope:'project',query:'greeting'}}).matches[0].record.value,'مرحبا');
  });

}
