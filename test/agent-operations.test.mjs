import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {prepareAgentBundle,openAgentMemory,createAgentSession} from '../adapters/agent/index.js';
import {testTimeout} from '../tools/test-limits.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=path.join(root,'.artifacts');
function setup(t,host='codex',locale='en') {
  fs.mkdirSync(artifacts,{recursive:true});
  const dir=fs.mkdtempSync(path.join(artifacts,"owner-日文 '$-"));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(artifacts)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const project=path.join(dir,'project');fs.mkdirSync(project);
  const prepared=prepareAgentBundle({host,locale,project,out:path.join(dir,'bundle')});
  const entry=path.join(prepared.directory,'owner.mjs');
  const run=(...args)=>spawnSync(process.execPath,[entry,...args],{cwd:project,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  const call=(...args)=>{const r=run(...args);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  return {...prepared,dir,project,run,call};
}
for(const host of ['codex','dsh','workbuddy'])test(host+' bundle has usable owner help with no store or host changes',t=>{
  const b=setup(t,host,'zh-CN'),before=fs.readdirSync(b.project);
  const r=b.run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/所有者/);
  assert.equal(fs.existsSync(b.binding.storage),false);assert.deepEqual(fs.readdirSync(b.project),before);
  assert.ok(fs.existsSync(path.join(b.directory,b.manifest.owner)));
  const readme=fs.readFileSync(path.join(b.directory,'README.md'),'utf8');
  assert.match(readme,/OPERATIONS.md/);assert.doesNotMatch(readme,/docs\/agent-integration/);
  const guide=fs.readFileSync(path.join(b.directory,'OPERATIONS.md'),'utf8');
  assert.match(guide,/备份/);assert.match(guide,/停用/);
  if(host==='dsh')assert.match(guide,/dsh --profile headless --patch/);
});
test('owner entry follows capture, independent review, correction, backup, forgetting and guarded restore',async t=>{
  const b=setup(t),session=createAgentSession(openAgentMemory(b.binding),b.binding);
  assert.equal(b.call('doctor').ok,true);
  const propose=value=>session.call('memory_propose',{scope:'project',kind:'preference',key:'language',value,evidenceId:'synthetic-'+value,reason:'Synthetic owner workflow'});
  const first=(await propose('日本語')).candidate;
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);
  assert.equal(b.call('inspect','--scope','project').candidates[0].id,first.id);
  assert.equal(b.call('inspect','--scope','project','--candidate',first.id).candidate.memory.value,'日本語');
  b.call('review','--scope','project','--candidate',first.id,'--revision',String(first.revision),'--decision','accept');
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches[0].record.value,'日本語');
  const next=(await propose('Español')).candidate;
  assert.notEqual(b.run('review','--scope','project','--candidate',next.id,'--revision','99','--decision','accept').status,0);
  b.call('review','--scope','project','--candidate',next.id,'--revision',String(next.revision),'--decision','accept');
  const current=(await session.call('memory_recall',{scope:'project'})).matches[0].record;assert.equal(current.value,'Español');
  const backup=path.join(b.dir,'backup.json');b.call('backup','--out',backup);
  const forgotten=path.join(b.dir,'forget.json');
  assert.equal(b.call('forget-preview','--scope','project','--memory',current.id,'--revision',String(current.revision),'--out',forgotten).previewOnly,true);
  b.call('forget-apply','--plan',forgotten);
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);
  const restore=path.join(b.dir,'restore.json');
  assert.equal(b.call('restore-preview','--backup',backup,'--out',restore).previewOnly,true);
  b.call('restore-apply','--backup',backup,'--plan',restore);
  const reopened=createAgentSession(openAgentMemory(b.binding),b.binding);
  assert.equal((await reopened.call('memory_recall',{scope:'project'})).matches[0].record.value,'Español');
});
test('Codex enable/disable changes only the selected project and refuses later edits',t=>{
  const b=setup(t),target=path.join(b.project,'.codex/config.toml');
  fs.mkdirSync(path.dirname(target));const original='model = "synthetic"\n[mcp_servers.other]\ncommand = "other"\n';fs.writeFileSync(target,original);
  b.call('enable');const installed=fs.readFileSync(target,'utf8');assert.ok(installed.startsWith(original));assert.match(installed,/mcp_servers.persona_memory/);
  fs.writeFileSync(target,installed+'# later edit\n');
  const refused=b.run('disable');assert.notEqual(refused.status,0);assert.match(refused.stderr,/changed/);assert.equal(fs.readFileSync(target,'utf8'),installed+'# later edit\n');
  fs.writeFileSync(target,installed);b.call('disable');assert.equal(fs.readFileSync(target,'utf8'),original);
  assert.notEqual(b.run('enable').status,0); // An undone bundle is not reused silently.
});
test('DSH and other host enable refuse without modifying project settings',t=>{
  for(const host of ['dsh','workbuddy']){
    const b=setup(t,host);assert.notEqual(b.run('enable').status,0);assert.notEqual(b.run('disable').status,0);
    assert.deepEqual(fs.readdirSync(b.project),[]);assert.equal(fs.existsSync(b.binding.storage),false);
  }
});
test('owner entry refuses redirected binding, unrelated actions and enable options',t=>{
  const b=setup(t);
  for(const args of [['doctor','--binding',path.join(b.dir,'other.json')],['prepare'],['enable','--target','other'],['help','--scope','project']])assert.notEqual(b.run(...args).status,0);
  assert.deepEqual(fs.readdirSync(b.project),[]);assert.equal(fs.existsSync(b.binding.storage),false);
});

test('owner doctor reports damaged storage as failure without overwriting original bytes',async t=>{
  const b=setup(t),session=createAgentSession(openAgentMemory(b.binding),b.binding);
  await session.call('memory_propose',{scope:'project',kind:'fact',key:'test',value:'synthetic',evidenceId:'synthetic-1',reason:'Synthetic damage fixture'});
  const fsPath=openAgentMemory(b.binding)._store.file;
  const damaged=Buffer.from('{broken-json');fs.writeFileSync(fsPath,damaged);
  const r=b.run('doctor');assert.notEqual(r.status,0);assert.equal(JSON.parse(r.stdout).ok,false);
  assert.ok(fs.readFileSync(fsPath).equals(damaged));
});

test('Codex owner enable refuses a linked config directory instead of editing its external destination',t=>{
  const b=setup(t),external=path.join(b.dir,'separate-config');fs.mkdirSync(external);
  const target=path.join(external,'config.toml'),original='model = "separate-settings"\n';fs.writeFileSync(target,original);
  fs.symlinkSync(external,path.join(b.project,'.codex'),process.platform==='win32'?'junction':'dir');
  const r=b.run('enable');assert.notEqual(r.status,0);assert.match(r.stderr,/real directory/);
  assert.equal(fs.readFileSync(target,'utf8'),original);assert.equal(fs.existsSync(path.join(b.directory,'installation.json')),false);
});
