import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {PersonaMemory,MemorySnapshotStore} from '../src/index.js';
import {prepareAgentBundle,createAgentSession,inspectAgentCandidates} from '../adapters/agent/index.js';
const root=fileURLToPath(new URL('../',import.meta.url)),base=path.join(root,'.artifacts');
const subject={type:'project',id:'p'};
function directory(t){
  fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'review-flow-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
function setup(t){
  const dir=directory(t),bundle=prepareAgentBundle({host:'claude-code',out:path.join(dir,'bundle'),project:dir,userId:'owner',locale:'ja'});
  const binding=bundle.binding,file=path.join(bundle.directory,'binding.json');
  const open=()=>new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  const pm=open();return {dir,binding,file,open,pm,session:createAgentSession(pm,binding)};
}
const input=(value='日本語',evidenceId='message-1',scope='project')=>({scope,kind:'preference',key:'language',value,evidenceId,reason:'Explicit synthetic request'});
const propose=(session,value,evidence)=>session.call('memory_propose',input(value,evidence));
const decision=(candidate,choice='accept')=>({scope:'project',candidateId:candidate.id,expectedRevision:candidate.revision,decision:choice});
const cli=(file,...args)=>spawnSync(process.execPath,['tools/connect.mjs',...args,'--binding',file],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
function bytes(binding){const name=fs.readdirSync(binding.storage).find(x=>x.endsWith('.json'));return fs.readFileSync(path.join(binding.storage,name));}

test('an active capture session sees independent owner acceptance, correction and forgetting without restarting',async t=>{
  const {binding,pm,session,open}=setup(t),first=(await propose(session)).candidate;
  const owner=createAgentSession(open(),{...binding,access:'review'});
  await owner.call('memory_review',decision(first));
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches[0].record.value,'日本語');
  const context=await session.call('memory_context',{scope:'project',budget:2000});
  const correction=(await propose(session,'العربية','message-2')).candidate;
  const owner2=createAgentSession(open(),{...binding,access:'review'});
  const accepted=await owner2.call('memory_review',decision(correction));
  await assert.rejects(session.call('memory_confirm',{contextId:context.contextId,turnId:'stale-turn'}),/unknown|expired/);
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches[0].record.value,'العربية');
  await owner2.call('memory_forget',{scope:'project',id:accepted.record.id,expectedRevision:accepted.record.revision});
  assert.equal((await session.call('memory_recall',{scope:'project'})).matches.length,0);
  const fresh=await propose(session,'English','message-3');assert.equal(fresh.candidate.status,'pending');
  assert.equal(pm.diagnostics().confirmedTurns,0);
});

test('unchanged refreshes retain same-connection contexts until successful confirmation',async t=>{
  const {binding,session,open}=setup(t),candidate=(await propose(session)).candidate;
  await createAgentSession(open(),{...binding,access:'review'}).call('memory_review',decision(candidate));
  const context=await session.call('memory_context',{scope:'project',budget:2000});
  await session.call('memory_status');await session.call('memory_candidates',{scope:'project'});await session.call('memory_recall',{scope:'project'});
  const receipt=await session.call('memory_confirm',{contextId:context.contextId,turnId:'used'});assert.equal(receipt.memoryCount,1);
  assert.equal((await session.call('memory_confirm',{contextId:context.contextId,turnId:'used'})).duplicate,true);
});

test('a writer racing after refresh still triggers CAS refusal and disables the connection',async t=>{
  const {binding,session,pm,open}=setup(t),persist=pm.persist.bind(pm);
  pm.persist=async()=>{const peer=open();peer.putMemory({id:'peer',subject:binding.subjects.project,kind:'fact',key:'peer',value:'kept'});await peer.persist();await persist();};
  await assert.rejects(propose(session),{code:'ERR_AGENT_STORE'});
  await assert.rejects(session.call('memory_recall',{scope:'project'}),{code:'ERR_AGENT_UNAVAILABLE'});
  const loaded=open();assert.equal(loaded.getMemory('peer').value,'kept');assert.equal(loaded.listCandidates({subject:binding.subjects.project}).length,0);
});

test('refresh errors do not issue stale cached answers and do not silently resume',async t=>{
  const {binding,session}=setup(t);await propose(session);
  const file=path.join(binding.storage,fs.readdirSync(binding.storage).find(x=>x.endsWith('.json'))),before=fs.readFileSync(file);
  fs.writeFileSync(file,'not JSON');
  await assert.rejects(session.call('memory_status'),{code:'ERR_AGENT_STORE'});
  fs.writeFileSync(file,before);
  await assert.rejects(session.call('memory_candidates',{scope:'project'}),{code:'ERR_AGENT_UNAVAILABLE'});
});

test('refresh never silently saves or discards an independently dirtied in-memory core',async t=>{
  const {binding,session,pm}=setup(t);
  pm.putMemory({subject:binding.subjects.project,kind:'fact',key:'uncommitted',value:'local'});
  const before=pm.export();await assert.rejects(session.call('memory_status'),{code:'ERR_AGENT_STORE'});
  assert.deepEqual(pm.export(),before);assert.equal(fs.existsSync(binding.storage),false);
});

for(const mode of ['json','memory'])test('ifChanged reload preserves context on an unchanged '+mode+' store',async t=>{
  const pm=mode==='json'?new PersonaMemory({storage:directory(t)}):await PersonaMemory.open({store:new MemorySnapshotStore()});
  pm.putMemory({subject,kind:'fact',key:'x',value:'kept'});await pm.persist();
  const context=pm.buildMemoryContext({subject,budget:2000,locale:'en'});await pm.reload({ifChanged:true});
  assert.equal(pm.confirmContext(context,{turnId:'unchanged'}).memoryCount,1);await pm.persist();
});

test('ifChanged reload adopts external commits and invalidates old pending contexts',async t=>{
  const dir=directory(t),pm=new PersonaMemory({storage:dir});
  pm.putMemory({id:'a',subject,kind:'fact',key:'a',value:'first'});await pm.persist();const context=pm.buildMemoryContext({subject,budget:2000});
  const other=new PersonaMemory({storage:dir});other.putMemory({id:'b',subject,kind:'fact',key:'b',value:'second'});await other.persist();
  await pm.reload({ifChanged:true});assert.equal(pm.getMemory('b').value,'second');assert.throws(()=>pm.confirmContext(context,{turnId:'old'}),/unknown|expired/);
});

test('ifChanged cannot bypass dirty-state protection or an explicit discard',async()=>{
  const pm=await PersonaMemory.open({store:new MemorySnapshotStore()});
  pm.putMemory({id:'a',subject,kind:'fact',key:'a',value:'saved'});await pm.persist();const context=pm.buildMemoryContext({subject,budget:2000});
  pm.putMemory({id:'b',subject,kind:'fact',key:'b',value:'unsaved'});const before=pm.export();
  await assert.rejects(pm.reload({ifChanged:true}),{code:'ERR_STORE_DIRTY'});assert.deepEqual(pm.export(),before);
  await pm.reload({ifChanged:true,discardChanges:true});assert.equal(pm.getMemory('b'),null);
  assert.throws(()=>pm.confirmContext(context,{turnId:'discarded'}),/unknown|expired/);
  await assert.rejects(pm.reload({ifChanged:'yes'}),/ifChanged/);
});

test('changes during an awaited same-revision read remain protected',async()=>{
  const backing=new MemorySnapshotStore(),store={read:()=>backing.read(),write:(...args)=>backing.write(...args)},pm=await PersonaMemory.open({store});
  let release;store.read=()=>new Promise(resolve=>{release=async()=>resolve(await backing.read());});
  const pending=pm.reload({ifChanged:true});pm.putMemory({id:'a',subject,kind:'fact',key:'a',value:'local'});
  await release();await assert.rejects(pending,{code:'ERR_STORE_DIRTY'});assert.equal(pm.getMemory('a').value,'local');
});

test('owner listing pages through scoped summaries without exposing values or writing data',async t=>{
  const {binding,pm}=setup(t);
  for(let i=0;i<35;i++)pm.proposeMemory({id:'p'+String(i).padStart(2,'0'),memory:{subject:binding.subjects.project,kind:'fact',key:'k'+i,value:'private value '+i,evidenceId:'source-'+i}});
  pm.proposeMemory({id:'private',memory:{subject:binding.subjects.personal,kind:'fact',key:'secret',value:'must not leak',evidenceId:'personal-source'}});await pm.persist();
  const before=bytes(binding),first=inspectAgentCandidates(binding,{scope:'project',limit:32}),second=inspectAgentCandidates(binding,{scope:'project',limit:32,after:first.nextAfter});
  assert.equal(first.candidates.length,32);assert.equal(second.candidates.length,3);assert.equal(second.nextAfter,null);
  assert.equal(new Set([...first.candidates,...second.candidates].map(x=>x.id)).size,35);
  assert.equal(JSON.stringify(first).includes('private value'),false);assert.equal(JSON.stringify(first).includes('must not leak'),false);
  assert.equal(first.evidenceVerified,false);assert.ok(before.equals(bytes(binding)));
});

test('owner detail shows the old value, proposed original text and real acceptance preconditions without mutation',async t=>{
  const {binding,pm}=setup(t),who=binding.subjects.project;
  pm.putMemory({subject:who,kind:'preference',key:'language',value:'English',source:'user'});
  const candidate=pm.proposeMemory({memory:{subject:who,kind:'preference',key:'language',value:'বাংলা 👩🏽‍💻',source:'model',evidenceId:'source'},reason:'explicit change'});await pm.persist();
  const before=bytes(binding),detail=inspectAgentCandidates(binding,{scope:'project',candidateId:candidate.id});
  assert.equal(detail.mode,'candidate');assert.equal(detail.current.value,'English');assert.equal(detail.candidate.memory.value,'বাংলা 👩🏽‍💻');
  assert.equal(detail.effect,'replace');assert.equal(detail.acceptance.allowed,true);assert.equal(detail.evidenceVerified,false);
  assert.ok(before.equals(bytes(binding)));assert.equal(pm.listMemories({subject:who})[0].value,'English');
});

test('stale candidate previews show a denial instead of pretending a correction can be accepted',async t=>{
  const {binding,pm}=setup(t),who=binding.subjects.project;
  const candidate=pm.proposeMemory({memory:{subject:who,kind:'fact',key:'x',value:'proposed',evidenceId:'source'}});
  pm.putMemory({subject:who,kind:'fact',key:'x',value:'newer truth'});await pm.persist();
  const before=bytes(binding),detail=inspectAgentCandidates(binding,{scope:'project',candidateId:candidate.id});
  assert.equal(detail.current.value,'newer truth');assert.equal(detail.acceptance.allowed,false);assert.equal(detail.acceptance.code,'ERR_CANDIDATE_CONFLICT');
  assert.ok(before.equals(bytes(binding)));
});

test('expired pending proposals remain inspectable but are clearly non-acceptable',async t=>{
  const {binding,pm}=setup(t);
  const candidate=pm.proposeMemory({ttlHours:0,memory:{subject:binding.subjects.project,kind:'fact',key:'expired',value:'old',evidenceId:'source'}});await pm.persist();
  assert.equal(inspectAgentCandidates(binding,{scope:'project'}).candidates[0].expired,true);
  const detail=inspectAgentCandidates(binding,{scope:'project',candidateId:candidate.id});
  assert.equal(detail.acceptance.allowed,false);assert.match(detail.acceptance.message,/expired/);
});

test('reviewed candidates are identified and a changed candidate revision cannot be accepted from an old preview',async t=>{
  const {binding,pm,file}=setup(t),who=binding.subjects.project;
  const candidate=pm.proposeMemory({memory:{subject:who,kind:'fact',key:'x',value:'one',evidenceId:'source'}});await pm.persist();
  const preview=inspectAgentCandidates(binding,{scope:'project',candidateId:candidate.id});
  pm.reviseCandidate(candidate.id,{expectedRevision:1,memory:{value:'two'}});await pm.persist();
  const stale=cli(file,'review','--scope','project','--candidate',candidate.id,'--revision',String(preview.candidate.revision),'--decision','accept');assert.notEqual(stale.status,0);
  const valid=cli(file,'review','--scope','project','--candidate',candidate.id,'--revision','2','--decision','accept');assert.equal(valid.status,0,valid.stderr);
  const reviewed=inspectAgentCandidates(binding,{scope:'project',candidateId:candidate.id});assert.equal(reviewed.acceptance.allowed,false);assert.equal(reviewed.candidate.status,'accepted');
  assert.equal(inspectAgentCandidates(binding,{scope:'project',status:'accepted'}).candidates.length,1);
});

test('foreign candidate details and missing IDs fail without exposing another scope',async t=>{
  const {binding,pm}=setup(t);
  const privateCandidate=pm.proposeMemory({memory:{subject:binding.subjects.personal,kind:'fact',key:'private',value:'secret',evidenceId:'source'}});await pm.persist();
  for(const id of [privateCandidate.id,'missing'])assert.throws(()=>inspectAgentCandidates(binding,{scope:'project',candidateId:id}),/unavailable in this scope/);
  assert.throws(()=>inspectAgentCandidates(binding,{scope:'unbound'}),/not granted/);
});

test('inspection validates bounded inputs, rejects getters and creates no missing store',t=>{
  const {binding}=setup(t);
  for(const query of [{scope:'project',limit:0},{scope:'project',limit:33},{scope:'project',status:'anything'},{scope:'project',after:'x'.repeat(257)},{scope:'project',candidateId:'x',limit:1},{scope:'project',outside:true}])
    assert.throws(()=>inspectAgentCandidates(binding,query));
  let invoked=0;const request={scope:'project'};Object.defineProperty(request,'limit',{enumerable:true,get(){invoked++;return 10;}});
  assert.throws(()=>inspectAgentCandidates(binding,request));assert.equal(invoked,0);
  assert.deepEqual(inspectAgentCandidates(binding,{scope:'project'}).candidates,[]);assert.equal(fs.existsSync(binding.storage),false);
});

test('pagination rejects a vanished or wrong-filter cursor rather than repeating pages forever',async t=>{
  const {binding,pm}=setup(t),candidate=pm.proposeMemory({memory:{subject:binding.subjects.project,kind:'fact',key:'x',value:'value',evidenceId:'source'}});await pm.persist();
  pm.rejectCandidate(candidate.id,{expectedRevision:1});await pm.persist();
  assert.throws(()=>inspectAgentCandidates(binding,{scope:'project',after:candidate.id}),/restart/);
  assert.equal(inspectAgentCandidates(binding,{scope:'project',status:'all'}).candidates[0].status,'rejected');
});

test('installed-style owner inspect CLI returns original JSON values while escaping display controls',async t=>{
  const {binding,session,file}=setup(t),candidate=(await propose(session,'العربية \u202e value')).candidate;
  const result=cli(file,'inspect','--scope','project','--candidate',candidate.id);assert.equal(result.status,0,result.stderr);
  const detail=JSON.parse(result.stdout);assert.equal(detail.candidate.memory.value,'العربية \u202e value');
  assert.equal(result.stdout.includes('\u202e'),false);assert.ok(result.stdout.includes('\\u202e'));
  assert.equal(cli(file,'inspect','--scope','project','--limit','33').status,1);
});

async function client(t,file){
  const child=spawn(process.execPath,['adapters/agent/server.js','--binding',file],{cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let next=0,buffer='',stderr='',pending=new Map();child.stdout.setEncoding('utf8');child.stderr.on('data',b=>{stderr+=b;});
  child.stdout.on('data',text=>{buffer+=text;let end;while((end=buffer.indexOf('\n'))>=0){const r=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);pending.get(r.id)?.resolve(r);pending.delete(r.id);}});
  child.on('exit',code=>{for(const p of pending.values())p.reject(Error('server exit '+code+': '+stderr));pending.clear();});
  t.after(()=>{child.stdin.destroy();if(child.exitCode===null)child.kill();});
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP deadline'));child.kill();},testTimeout(5000));
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'owner-flow-test',version:'1'}});
  return {async call(name,args){const r=await request('tools/call',{name,arguments:args});assert.equal(r.result.isError,undefined,JSON.stringify(r));return r.result.structuredContent;},async close(){const closed=once(child,'exit');child.stdin.end();await closed;assert.equal(child.exitCode,0,stderr);}};
}
test('a still-running MCP process sees real owner inspect and review CLI results on its next call',async t=>{
  const {file}=setup(t),running=await client(t,file),candidate=(await running.call('memory_propose',input('cafe\u0301 咖啡 कॉफ़ी'))).candidate;
  const list=cli(file,'inspect','--scope','project');assert.equal(list.status,0,list.stderr);assert.equal(JSON.parse(list.stdout).candidates[0].id,candidate.id);
  const detail=cli(file,'inspect','--scope','project','--candidate',candidate.id);assert.equal(JSON.parse(detail.stdout).acceptance.allowed,true);
  const reviewed=cli(file,'review','--scope','project','--candidate',candidate.id,'--revision','1','--decision','accept');assert.equal(reviewed.status,0,reviewed.stderr);
  const matches=(await running.call('memory_recall',{scope:'project',query:'कॉफ़ी',locale:'hi'})).matches;assert.equal(matches[0].record.value,'cafe\u0301 咖啡 कॉफ़ी');
  const next=await running.call('memory_propose',input('English','next-message'));assert.equal(next.candidate.status,'pending');
  assert.equal((await running.call('memory_candidates',{scope:'project',status:'accepted'})).candidates[0].id,candidate.id);await running.close();
});
