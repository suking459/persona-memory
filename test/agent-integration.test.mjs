import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {PassThrough,Readable} from 'node:stream';
import {PersonaMemory} from '../src/index.js';
import {normalizeBinding,createAgentSession,createAgentRpc,prepareAgentBundle,HOST_PROFILES,applyAgentBundle,undoAgentBundle} from '../adapters/agent/index.js';
import {serveStdio} from '../adapters/agent/stdio.js';
const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=path.join(root,'.artifacts');
function directory(t){
  fs.mkdirSync(artifacts,{recursive:true});const dir=fs.mkdtempSync(path.join(artifacts,'agent-test-'));
  t.after(()=>{const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(artifacts)+path.sep));fs.rmSync(absolute,{recursive:true,force:true});});return dir;
}
function setup(t,access='review'){
  const dir=directory(t),binding=normalizeBinding({version:1,host:'test',storage:path.join(dir,'memory.json'),persona:'agent-memory',namespace:'test-project',access,
    subjects:{project:{type:'project',id:'p'},personal:{type:'user',id:'u'}}});
  const pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  return {dir,binding,pm,session:createAgentSession(pm,binding)};
}
const proposal=(value='Chinese',evidenceId='message-1',scope='project')=>({scope,kind:'preference',key:'language',value,evidenceId,reason:'Explicit request in the referenced message'});
async function remember(session,value='Chinese',evidenceId='message-1'){
  const result=await session.call('memory_propose',proposal(value,evidenceId));
  return session.call('memory_review',{scope:'project',candidateId:result.candidate.id,expectedRevision:result.candidate.revision,decision:'accept'});
}
test('agent proposals stay pending, repeat safely, and become searchable only after review',async t=>{
  const {session}=setup(t);
  const first=await session.call('memory_propose',proposal());
  const repeated=await session.call('memory_propose',proposal());
  assert.equal(first.candidate.id,repeated.candidate.id);
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);
  const approved=await session.call('memory_review',{scope:'project',candidateId:first.candidate.id,expectedRevision:1,decision:'accept'});
  assert.equal(approved.record.value,'Chinese');
  assert.equal((await session.call('memory_recall',{scope:'project',query:'language'})).matches.length,1);
});
test('capture and read capabilities cannot be escalated with arguments or guessed tool names',async t=>{
  const {binding,pm}=setup(t);
  for(const access of ['capture','read']){
    const session=createAgentSession(pm,{...binding,access});
    assert.ok(!session.tools.some(tool=>tool.name==='memory_review'));
    await assert.rejects(session.call('memory_review',{}),/not granted/);
    await assert.rejects(session.call('memory_recall',{scope:'project',subject:{type:'user',id:'other'}}),/invalid/);
    await assert.rejects(session.call('memory_recall',{scope:'outside'}),/not granted/);
    if(access==='read')await assert.rejects(session.call('memory_propose',proposal()),/not granted/);
  }
});
test('binding is detached and rejects unknown grants, accessors, duplicates and unsafe names',t=>{
  const {binding}=setup(t);
  assert.throws(()=>normalizeBinding({...binding,allowAll:true}),/field/);
  assert.throws(()=>normalizeBinding({...binding,access:'admin'}),/access/);
  assert.throws(()=>normalizeBinding({...binding,subjects:{a:{type:'project',id:'p'},b:{type:'project',id:'p'}}}),/duplicate/);
  assert.throws(()=>normalizeBinding({...binding,subjects:JSON.parse('{"__proto__":{"type":"project","id":"p"}}')}),/alias/);
  let calls=0;const raw={...binding};Object.defineProperty(raw,'storage',{enumerable:true,get(){calls++;return binding.storage;}});
  assert.throws(()=>normalizeBinding(raw));assert.equal(calls,0);
});
test('foreign candidate IDs cannot be accepted or rejected through a bound scope',async t=>{
  const {session}=setup(t);
  const foreign=await session.call('memory_propose',proposal('private','private-source','personal'));
  for(const decision of ['accept','reject'])await assert.rejects(session.call('memory_review',{scope:'project',candidateId:foreign.candidate.id,expectedRevision:1,decision}),/unavailable/);
  assert.equal((await session.call('memory_candidates',{scope:'project'})).candidates.length,0);
});
test('a correction survives process-independent reload and stale concurrent correction is refused',async t=>{
  const {binding,session}=setup(t);await remember(session);
  const stale=await session.call('memory_propose',proposal('French','old-correction'));
  const fresh=await session.call('memory_propose',proposal('English','fresh-correction'));
  await session.call('memory_review',{scope:'project',candidateId:fresh.candidate.id,expectedRevision:1,decision:'accept'});
  await assert.rejects(session.call('memory_review',{scope:'project',candidateId:stale.candidate.id,expectedRevision:1,decision:'accept'}),/changed|conflict|stale/i);
  const reopened=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  const reader=createAgentSession(reopened,{...binding,access:'read'});
  assert.equal((await reader.call('memory_recall',{scope:'project'})).matches[0].record.value,'English');
});
test('forgetting requires current scope/head/revision and removes its history, not a peer scope',async t=>{
  const {session}=setup(t);const first=await remember(session);
  const second=await remember(session,'English','message-2');
  const other=await session.call('memory_propose',proposal('private','private','personal'));
  const peer=await session.call('memory_review',{scope:'personal',candidateId:other.candidate.id,expectedRevision:1,decision:'accept'});
  await assert.rejects(session.call('memory_forget',{scope:'project',id:first.record.id,expectedRevision:1}),/current/);
  await assert.rejects(session.call('memory_forget',{scope:'project',id:second.record.id,expectedRevision:99}),/changed/);
  await assert.rejects(session.call('memory_forget',{scope:'project',id:peer.record.id,expectedRevision:1}),/unavailable/);
  await session.call('memory_forget',{scope:'project',id:second.record.id,expectedRevision:second.record.revision});
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);
  assert.equal((await session.call('memory_candidates',{scope:'project'})).candidates.length,0);
  assert.equal((await session.call('memory_recall',{scope:'personal'})).matches.length,1);
});
test('one connection cannot confirm a context created by another connection sharing the core',async t=>{
  const {binding,pm,session}=setup(t);await remember(session);
  const peer=createAgentSession(pm,{...binding,access:'capture'});
  const context=await session.call('memory_context',{scope:'project'});
  await assert.rejects(peer.call('memory_confirm',{contextId:context.contextId,turnId:'turn-1'}),/not created/);
  const result=await session.call('memory_confirm',{contextId:context.contextId,turnId:'turn-1'});
  assert.equal(result.confirmed,true);
  assert.equal((await session.call('memory_confirm',{contextId:context.contextId,turnId:'turn-1'})).duplicate,true);
});
test('persistence failure issues no success receipt and refuses uncommitted reads until restart',async t=>{
  const {pm,session}=setup(t);pm.persist=async()=>{throw new Error('disk failed');};
  await assert.rejects(session.call('memory_propose',proposal()),error=>error.code==='ERR_AGENT_STORE');
  await assert.rejects(session.call('memory_recall',{scope:'project'}),error=>error.code==='ERR_AGENT_UNAVAILABLE');
});
test('concurrent direct calls cannot run a second mutation while persistence is pending',async t=>{
  const {pm,session}=setup(t);let release;
  const original=pm.persist.bind(pm);
  pm.persist=()=>new Promise(resolve=>{release=async()=>{await original();resolve();};});
  const pending=session.call('memory_propose',proposal());
  await assert.rejects(session.call('memory_propose',proposal('other','message-2')),error=>error.code==='ERR_AGENT_BUSY');
  await release();await pending;
});
test('clean sessions refresh independently committed snapshots before proposing again',async t=>{
  const {binding,session}=setup(t);await remember(session);
  const other=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  other.putMemory({subject:binding.subjects.project,kind:'fact',key:'external',value:'truth',source:'manual'});await other.persist();
  await session.call('memory_propose',proposal('English','later'));
  assert.equal((await session.call('memory_recall',{scope:'project',query:'external'})).matches[0].record.value,'truth');
  const reopened=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  assert.equal(reopened.listMemories({subject:binding.subjects.project}).length,2);
});
test('MCP handshake negotiates legacy clients and tools have server-side access restrictions',async t=>{
  const {session}=setup(t,'capture'),rpc=createAgentRpc(session);
  assert.equal((await rpc({jsonrpc:'2.0',id:1,method:'tools/list'})).error.code,-32000);
  const init=await rpc({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-06-18'}});
  assert.equal(init.result.protocolVersion,'2025-06-18');
  assert.match(init.result.instructions,/pending/);
  assert.equal(await rpc({jsonrpc:'2.0',method:'notifications/initialized'}),null);
  const result=await rpc({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'memory_review',arguments:{}}});
  assert.equal(result.result.isError,true);
});
test('stdio enforces each frame rather than rejecting a large batch of valid short requests',async()=>{
  const output=new PassThrough(),chunks=[];output.on('data',b=>chunks.push(b));
  const frames=Array.from({length:80},(_,id)=>JSON.stringify({id})+'\n').join('');
  await serveStdio(x=>({id:x.id}),{input:Readable.from([Buffer.from(frames)]),output,maxInputBytes:32});
  assert.equal(Buffer.concat(chunks).toString().trim().split('\n').length,80);
});
test('stdio reconstructs split UTF-8 and accepts a final non-newline frame',async()=>{
  const bytes=Buffer.from('{"text":"记忆"}'),output=new PassThrough(),chunks=[];output.on('data',b=>chunks.push(b));
  await serveStdio(x=>x,{input:Readable.from([...bytes].map(b=>Buffer.from([b]))),output});
  assert.equal(JSON.parse(Buffer.concat(chunks).toString()).text,'记忆');
});
test('stdio rejects malformed UTF-8 and excessive frames without processing their contents',async()=>{
  for(const [chunks,limit] of [[[Buffer.from([0xff,10])],32],[[Buffer.from('x'.repeat(33))],32]]){
    let calls=0;const output=new PassThrough();output.resume();
    await assert.rejects(serveStdio(()=>{calls++;},{input:Readable.from(chunks),output,maxInputBytes:limit}));
    assert.equal(calls,0);
  }
});
test('stdio syntax errors produce parse errors and later valid frames still work',async()=>{
  const output=new PassThrough(),chunks=[];output.on('data',b=>chunks.push(b));
  await serveStdio(x=>x,{input:Readable.from([Buffer.from('bad\n{"ok":true}\n')]),output});
  const lines=Buffer.concat(chunks).toString().trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(lines[0].error.code,-32700);assert.equal(lines[1].ok,true);
});
for(const host of Object.keys(HOST_PROFILES))test('prepares '+host+' without touching host configuration or claiming host verification',t=>{
  const dir=directory(t),out=path.join(dir,'bundle');
  const bundle=prepareAgentBundle({host,out,project:dir});
  assert.equal(bundle.manifest.verification.hostEndToEnd,false);
  assert.equal(bundle.binding.access,'capture');
  assert.equal(fs.existsSync(bundle.binding.storage),false);
  assert.ok(fs.existsSync(path.join(out,bundle.manifest.configuration)));
  assert.throws(()=>prepareAgentBundle({host,out,project:dir}),/exist/);
  if(host==='workbuddy'){
    assert.ok(fs.existsSync(path.join(out,'connector-meta.json')));
    assert.ok(fs.existsSync(path.join(out,'skills','persona-memory','SKILL.md')));
  }
});
test('project directory spelling through a symlink does not create another project identity',t=>{
  const dir=directory(t),link=path.join(dir,'alias');fs.symlinkSync(dir,link,process.platform==='win32'?'junction':'dir');
  const a=prepareAgentBundle({host:'codex',out:path.join(dir,'a'),project:dir});
  const b=prepareAgentBundle({host:'codex',out:path.join(dir,'b'),project:link});
  assert.deepEqual(a.binding.subjects,b.binding.subjects);
});
test('explicit JSON application preserves sibling settings, rejects replacement and restores exact bytes',t=>{
  const dir=directory(t),bundle=path.join(dir,'bundle'),target=path.join(dir,'settings.json');
  prepareAgentBundle({host:'gemini-cli',out:bundle,project:dir});
  const before=Buffer.from('{"theme":"dark","mcpServers":{"other":{"command":"other"}}}\n');
  fs.writeFileSync(target,before);
  applyAgentBundle({bundle,target});
  const value=JSON.parse(fs.readFileSync(target));
  assert.equal(value.theme,'dark');assert.equal(value.mcpServers.other.command,'other');assert.ok(value.mcpServers.persona_memory);
  assert.throws(()=>applyAgentBundle({bundle,target}),/installation record/);
  undoAgentBundle({bundle});assert.ok(fs.readFileSync(target).equals(before));
});
test('uninstall refuses to clobber host changes made after application',t=>{
  const dir=directory(t),bundle=path.join(dir,'bundle'),target=path.join(dir,'settings.json');
  prepareAgentBundle({host:'qwen-code',out:bundle,project:dir});applyAgentBundle({bundle,target});
  const value=JSON.parse(fs.readFileSync(target));value.userChange=true;fs.writeFileSync(target,JSON.stringify(value));
  assert.throws(()=>undoAgentBundle({bundle}),/changed/);
  assert.equal(JSON.parse(fs.readFileSync(target)).userChange,true);
});
test('Codex append preserves unrelated TOML and refuses ambiguous existing declarations',t=>{
  const dir=directory(t),bundle=path.join(dir,'bundle'),target=path.join(dir,'config.toml');
  prepareAgentBundle({host:'codex',out:bundle,project:dir});
  const before='model = "test-model"\n[mcp_servers.other]\ncommand = "other"\n';fs.writeFileSync(target,before);
  applyAgentBundle({bundle,target});assert.ok(fs.readFileSync(target,'utf8').startsWith(before));
  undoAgentBundle({bundle});assert.equal(fs.readFileSync(target,'utf8'),before);
  const second=path.join(dir,'second');prepareAgentBundle({host:'codex',out:second,project:dir});
  fs.writeFileSync(target,'# persona_memory already managed elsewhere\n');
  assert.throws(()=>applyAgentBundle({bundle:second,target}),/already mentioned/);
});
async function client(t,bindingFile){
  const child=spawn(process.execPath,['adapters/agent/server.js','--binding',bindingFile],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let pending=new Map(),next=0,buffer='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.on('data',b=>{stderr+=b;});
  child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const r=JSON.parse(line);pending.get(r.id)?.resolve(r);pending.delete(r.id);}});
  child.on('exit',code=>{for(const p of pending.values())p.reject(new Error('server exit '+code+': '+stderr));pending.clear();});
  t.after(()=>{child.stdin.destroy();if(child.exitCode===null)child.kill();});
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP deadline'));child.kill();},testTimeout(5000));pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});
  return {request,async close(){const exit=once(child,'exit');child.stdin.end();await exit;assert.equal(child.exitCode,0,stderr);}};
}
test('actual MCP subprocess persists reviewed data, reloads after exit, and returns current correction',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'claude-code',out:path.join(dir,'bundle'),project:dir,access:'review'});
  const file=path.join(bundle.directory,'binding.json'),first=await client(t,file);
  const proposed=await first.request('tools/call',{name:'memory_propose',arguments:proposal()});
  const candidate=proposed.result.structuredContent.candidate;
  const accepted=await first.request('tools/call',{name:'memory_review',arguments:{scope:'project',candidateId:candidate.id,expectedRevision:1,decision:'accept'}});
  assert.equal(accepted.result.isError,undefined);await first.close();
  const second=await client(t,file);
  const result=await second.request('tools/call',{name:'memory_recall',arguments:{scope:'project',query:'language'}});
  assert.equal(result.result.structuredContent.matches[0].record.value,'Chinese');await second.close();
});

test('retrying a proposal already accepted reports its existing review state accurately',async t=>{
  const {session}=setup(t);await remember(session);
  const retry=await session.call('memory_propose',proposal());
  assert.equal(retry.candidate.status,'accepted');assert.equal(retry.approved,true);
});
test('a volatile core cannot claim the durable binding is active',t=>{
  const {binding}=setup(t);
  assert.throws(()=>createAgentSession(new PersonaMemory({persona:binding.persona,scope:binding.namespace}),binding),/persistent/);
});
test('configuration application rejects an unrelated target filename without writing it',t=>{
  const dir=directory(t),bundle=path.join(dir,'bundle'),target=path.join(dir,'LICENSE');
  prepareAgentBundle({host:'codex',out:bundle,project:dir});fs.writeFileSync(target,'preserve');
  assert.throws(()=>applyAgentBundle({bundle,target}),/filename/);assert.equal(fs.readFileSync(target,'utf8'),'preserve');
});
