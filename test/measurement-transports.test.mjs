import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {PersonaMemory} from '../src/index.js';
import {prepareAgentBundle,createAgentSession,openAgentMemory,createSharedSpace,prepareSharedAgentBundle,revokeSharedAgent} from '../adapters/agent/index.js';
import {connectCommand} from '../tools/connect.mjs';import {testTimeout} from '../tools/test-limits.mjs';
import {assertOwnerOutput} from '../adapters/agent/output.js';
const root=fileURLToPath(new URL('../',import.meta.url)),base=path.join(root,'.artifacts');
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'measurement-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function setup(t){const dir=directory(t),b=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,userId:'owner'});return{dir,b};}
const run=(b,...args)=>spawnSync(process.execPath,[path.join(b.directory,'owner.mjs'),...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
function expired(binding){const pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace,clock:()=>1000});pm.putMemory({subject:binding.subjects.project??binding.subjects.shared,kind:'fact',key:'expired',value:'Synthetic',expiresAt:2000});pm.flush();return pm;}

test('Agent scalar metrics are connection/scope-local, reject bodies and never persist',async t=>{
  const {b}=setup(t),pm=openAgentMemory(b.binding),s=createAgentSession(pm,b.binding),before=pm.export();
  await s.call('memory_measure',{scope:'project',operation:'task',durationMs:4,success:true,inputTokens:20});
  assert.equal((await s.call('memory_metrics',{scope:'project'})).retained,1);
  const anotherScope=Object.keys(b.binding.subjects).find(x=>x!=='project');assert.equal((await s.call('memory_metrics',{scope:anotherScope})).retained,0);
  await assert.rejects(s.call('memory_measure',{scope:'project',operation:'task',durationMs:4,success:true,text:'private'}));
  assert.deepEqual(pm.export(),before);assert.equal(fs.existsSync(b.binding.storage),false);
  assert.equal((await createAgentSession(openAgentMemory(b.binding),b.binding).call('memory_metrics',{scope:'project'})).retained,0);
  await assert.rejects(createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'read'}).call('memory_measure',{scope:'project',operation:'task',durationMs:1,success:true}),/not granted/);
});
test('actual MCP process returns bounded scalar metrics without model calls',t=>{
  const {b}=setup(t),messages=[{jsonrpc:'2.0',id:1,method:'initialize'},
    {jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'memory_measure',arguments:{scope:'project',operation:'recall',durationMs:5,success:false}}},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'memory_metrics',arguments:{scope:'project'}}}];
  const r=spawnSync(process.execPath,['adapters/agent/server.js','--binding',path.join(b.directory,'binding.json')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000),input:messages.map(JSON.stringify).join('\n')+'\n'});
  assert.equal(r.status,0,r.stderr);const result=r.stdout.trim().split(/\r?\n/).map(JSON.parse).find(x=>x.id===3).result;
  assert.notEqual(result.isError,true);const report=JSON.parse(result.content[0].text);assert.equal(report.operations.recall.failed,1);assert.equal(report.operations.recall.inputTokens,null);
});
test('fixed owner maintenance previews/apply work across restarts and model capture cannot apply',async t=>{
  const {dir,b}=setup(t);expired(b.binding);const plan=path.join(dir,'plan.json');
  const capture=createAgentSession(openAgentMemory(b.binding),b.binding);await assert.rejects(capture.call('memory_maintenance_preview',{scope:'project'}),/not granted/);
  let r=run(b,'maintenance-preview','--scope','project','--out',plan);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).impact.memories,1);
  r=run(b,'maintenance-apply','--plan',plan);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).removed.memories,1);assert.equal(openAgentMemory(b.binding).diagnostics().memories,0);
});
test('Agent maintenance uses a detached preview belonging to one connection and scope',async t=>{
  const {b}=setup(t);expired(b.binding);const owner=createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'review'});
  const preview=await owner.call('memory_maintenance_preview',{scope:'project'}),other=createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'review'});
  await assert.rejects(other.call('memory_maintenance_apply',{scope:'project',previewId:preview.previewId}),/unavailable/);
  const foreign=Object.keys(b.binding.subjects).find(x=>x!=='project');await assert.rejects(owner.call('memory_maintenance_apply',{scope:foreign,previewId:preview.previewId}),/unavailable/);
  preview.targets.length=0;preview.impact.memories=999;
  const result=await owner.call('memory_maintenance_apply',{scope:'project',previewId:preview.previewId});assert.equal(result.removed.memories,1);
  await assert.rejects(owner.call('memory_maintenance_apply',{scope:'project',previewId:preview.previewId}),/unavailable/);
});
test('owner plan output cannot occupy the snapshot filename of an empty store',t=>{
  const {b}=setup(t),pm=openAgentMemory(b.binding);fs.mkdirSync(b.binding.storage,{recursive:true});
  const file=pm._store.file,r=run(b,'maintenance-preview','--scope','project','--out',file);
  assert.notEqual(r.status,0);assert.equal(fs.existsSync(file),false);
});
test('owner exports reject linked aliases of the store and preserve an empty snapshot path',async t=>{
  const {dir,b}=setup(t),pm=openAgentMemory(b.binding);fs.mkdirSync(b.binding.storage,{recursive:true});
  const alias=path.join(dir,'store-alias');fs.symlinkSync(b.binding.storage,alias,process.platform==='win32'?'junction':'dir');
  for(const [action,args] of [['maintenance-preview',['--scope','project']],['backup',[]]]){
    const out=path.join(alias,'owner-output.json'),r=run(b,action,...args,'--out',out);assert.notEqual(r.status,0);assert.equal(fs.existsSync(out),false);
  }
  assert.equal(fs.existsSync(pm._store.file),false);
  const backup=path.join(dir,'backup.json');assert.equal(run(b,'backup','--out',backup).status,0);
  const r=run(b,'restore-preview','--backup',backup,'--out',pm._store.file);assert.notEqual(r.status,0);assert.equal(fs.existsSync(pm._store.file),false);
  assert.throws(()=>assertOwnerOutput(path.join(dir,'root-check.json'),path.parse(dir).root),/outside/);
});
test('shared maintenance requires review and revoked owner plans cannot execute',t=>{
  const dir=directory(t),space=createSharedSpace({out:path.join(dir,'space'),subject:{type:'project',id:'p'}}),
    capture=prepareSharedAgentBundle({policy:space.policy,host:'codex',contributor:'writer',out:path.join(dir,'writer')}),
    owner=prepareSharedAgentBundle({policy:space.policy,host:'dsh',contributor:'owner',access:'review',out:path.join(dir,'owner')});
  expired(owner.binding);const plan=path.join(dir,'plan.json');
  assert.notEqual(run(capture,'maintenance-preview','--scope','shared','--out',plan).status,0);
  const r=run(owner,'maintenance-preview','--scope','shared','--out',plan);assert.equal(r.status,0,r.stderr);
  revokeSharedAgent({policy:space.policy,grantId:owner.grantId});assert.notEqual(run(owner,'maintenance-apply','--plan',plan).status,0);
  assert.equal(openAgentMemory(owner.binding).diagnostics().memories,1);
});
test('trial comparison CLI needs no binding, rejects overwrite and retains no arbitrary text',async t=>{
  const dir=directory(t),file=path.join(dir,'trials.json'),out=path.join(dir,'report.json');fs.writeFileSync(file,JSON.stringify([
    {caseIndex:1,mode:'enabled',durationMs:1,success:true},{caseIndex:1,mode:'disabled',durationMs:3,success:true}]));
  const result=await connectCommand(['compare-trials','--input',file,'--out',out]);assert.equal(result.summary.meanDurationDeltaMs,-2);
  await assert.rejects(connectCommand(['compare-trials','--input',file,'--out',out]),{code:'EEXIST'});
  fs.writeFileSync(file,JSON.stringify([{caseIndex:1,mode:'enabled',durationMs:1,success:true,text:'private'}]));await assert.rejects(connectCommand(['compare-trials','--input',file]));
});
