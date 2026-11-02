import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {getEventListeners} from 'node:events';
import {PersonaMemory} from '../src/index.js';
import {createHttpEmbedder,normalizeEmbeddingConfig,createSemanticRetriever} from '../adapters/semantic/index.js';
import {prepareAgentBundle,createAgentSession} from '../adapters/agent/index.js';
import {agentClient} from './fixtures/agent-rpc-client.mjs';
import {testTimeout} from '../tools/test-limits.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const wait=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('test fixture deadline')),testTimeout(10000));promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function server(t,handler){
  const app=http.createServer(async(req,res)=>{res.on('error',()=>{});try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const text=Buffer.concat(chunks).toString();await handler(req,res,text?JSON.parse(text):{});}catch(error){if(!res.destroyed){res.statusCode=500;res.end('fixture error');}}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{app.close(resolve);app.closeAllConnections?.();}));
  return {url:'http://127.0.0.1:'+app.address().port};
}
const config=(url,extra={})=>({provider:'ollama',endpoint:url+'/api/embed',model:'fixture-model',timeoutMs:Math.min(60000,testTimeout(5000)),...extra});
const vector=text=>/coffee|咖啡|café|قهوة/i.test(text)?[1,0]:[0,1];
const reply=(res,body)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
function directory(t){const base=path.join(root,'.artifacts');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'semantic-http-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}

test('Ollama HTTP protocol sends whole inputs with truncation disabled and returns ordered vectors',async t=>{
  let received;const app=await server(t,(_req,res,body)=>{received=body;reply(res,{model:'fixture-model',embeddings:body.input.map(vector)});});
  const embed=createHttpEmbedder(config(app.url));const result=await embed({texts:['咖啡','tea'],signal:new AbortController().signal});
  assert.deepEqual(result,[[1,0],[0,1]]);assert.deepEqual(received.input,['咖啡','tea']);assert.equal(received.truncate,false);
});

test('OpenAI-compatible responses use explicit indices and only the configured synthetic credential',async t=>{
  let auth,received;const app=await server(t,(req,res,body)=>{auth=req.headers.authorization;received=body;reply(res,{model:'fixture-model',data:body.input.map((_,index)=>({object:'embedding',index,embedding:[index+1,1]})).reverse()});});
  const embed=createHttpEmbedder(config(app.url,{provider:'openai-compatible',endpoint:app.url+'/v1/embeddings'}),{apiKey:'synthetic-key'});
  assert.deepEqual(await embed({texts:['a','b'],signal:new AbortController().signal}),[[1,1],[2,1]]);assert.equal(auth,'Bearer synthetic-key');assert.equal(received.encoding_format,'float');
});

test('duplicate or missing OpenAI response indices cannot rebind vectors to different memories',async t=>{
  for(const type of ['duplicate','missing']){
    const app=await server(t,(_req,res)=>reply(res,{model:'fixture-model',data:type==='duplicate'?[{index:0,embedding:[1]},{index:0,embedding:[1]}]:[{index:0,embedding:[1]}]}));
    const embed=createHttpEmbedder(config(app.url,{provider:'openai-compatible'}));await assert.rejects(embed({texts:['a','b'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_PROTOCOL'});
  }
});

test('credential-free configuration never copies a raw key into binding and missing named credentials make no request',async t=>{
  let calls=0;const app=await server(t,(_req,res)=>{calls++;reply(res,{model:'fixture-model',embeddings:[[1,0]]});});
  const raw=config(app.url,{apiKeyEnv:'PM_ONLY_SYNTHETIC_MISSING_KEY'}),embed=createHttpEmbedder(raw);
  await assert.rejects(embed({texts:['coffee'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_AUTH'});assert.equal(calls,0);assert.equal(JSON.stringify(normalizeEmbeddingConfig(raw)).includes('Bearer'),false);
});

test('configuration rejects raw credentials, URL secrets, remote plaintext and invalid limits',()=>{
  for(const raw of [
    {provider:'unknown',endpoint:'https://example.com/embed',model:'m'},
    {provider:'ollama',endpoint:'http://example.com/embed',model:'m'},
    {provider:'ollama',endpoint:'https://user:secret@example.com/embed',model:'m'},
    {provider:'ollama',endpoint:'https://example.com/embed?api_key=secret',model:'m'},
    {provider:'ollama',endpoint:'file:///private',model:'m'},
    {provider:'ollama',endpoint:'https://example.com/embed',model:'m',apiKey:'secret'},
    {provider:'ollama',endpoint:'http://127.0.0.1/embed',model:'m',timeoutMs:0},
    {provider:'ollama',endpoint:'http://127.0.0.1/embed',model:'m',maxCandidates:129},
    {provider:'ollama',endpoint:'http://127.0.0.1/embed',model:'m',apiKeyEnv:'not-safe-env'},
  ])assert.throws(()=>normalizeEmbeddingConfig(raw));
});

test('HTTP failures never reflect response bodies or provider credentials to the caller',async t=>{
  const app=await server(t,(_req,res)=>{res.statusCode=401;res.end('synthetic-key private body');});
  await assert.rejects(createHttpEmbedder(config(app.url),{apiKey:'synthetic-key'})({texts:['coffee'],signal:new AbortController().signal}),error=>error.code==='ERR_EMBEDDING_HTTP'&&!error.message.includes('synthetic-key'));
});

test('redirects cannot forward credentials or source content to a second endpoint',async t=>{
  let reached=0;const second=await server(t,(_req,res)=>{reached++;reply(res,{model:'fixture-model',embeddings:[[1,0]]});});
  const first=await server(t,(_req,res)=>{res.statusCode=302;res.setHeader('location',second.url+'/api/embed');res.end();});
  await assert.rejects(createHttpEmbedder(config(first.url),{apiKey:'synthetic-key'})({texts:['private synthetic text'],signal:new AbortController().signal}));
  assert.equal(reached,0);
});

test('both declared and chunked response byte limits stop decoding oversized embeddings',async t=>{
  for(const declared of [true,false]){
    const app=await server(t,(_req,res)=>{if(declared)res.setHeader('content-length','100000');res.write('{"model":"fixture-model","padding":"');res.end('x'.repeat(3000)+'"}');});
    await assert.rejects(createHttpEmbedder(config(app.url),{maxResponseBytes:1024})({texts:['coffee'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_PROTOCOL'});
  }
});

test('invalid UTF-8 response bodies fail instead of being repaired into a different result',async t=>{
  const app=await server(t,(_req,res)=>res.end(Buffer.from([0xff])));
  await assert.rejects(createHttpEmbedder(config(app.url))({texts:['coffee'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_PROTOCOL'});
});

test('a response body that never ends has a bounded standalone HTTP deadline',async t=>{
  const app=await server(t,(_req,res)=>{res.write('{"model":"fixture-model",');});
  await assert.rejects(createHttpEmbedder(config(app.url,{timeoutMs:30}))({texts:['coffee'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_TIMEOUT'});
});

test('standalone HTTP abort removes listeners and does not leak a late response',async t=>{
  const started=deferred(),app=await server(t,(_req,res)=>{started.resolve();res.write('{"model":"fixture-model",');});
  const controller=new AbortController(),before=getEventListeners(controller.signal,'abort').length;
  const task=createHttpEmbedder(config(app.url))({texts:['coffee'],signal:controller.signal});await wait(started.promise);controller.abort();
  await assert.rejects(task,{code:'ERR_EMBEDDING_ABORTED'});assert.equal(getEventListeners(controller.signal,'abort').length,before);
});

test('changed returned model identity rejects warm-provider reuse until reconfigured',async t=>{
  let model='model-v1';const app=await server(t,(_req,res,body)=>reply(res,{model,embeddings:body.input.map(vector)}));
  const embed=createHttpEmbedder(config(app.url));await embed({texts:['coffee'],signal:new AbortController().signal});model='model-v2';
  await assert.rejects(embed({texts:['coffee'],signal:new AbortController().signal}),{code:'ERR_EMBEDDING_MODEL_CHANGED'});
});

test('invalid response vectors cause visible lexical fallback rather than broken similarities',async t=>{
  const app=await server(t,(_req,res)=>reply(res,{model:'fixture-model',embeddings:[[1,0],[0,0]]}));
  const pm=new PersonaMemory();pm.putMemory({subject:{type:'project',id:'p'},kind:'fact',key:'drink',value:'coffee'});
  const result=await createSemanticRetriever(pm,{subject:{type:'project',id:'p'},embed:createHttpEmbedder(config(app.url))}).search({query:'coffee'});
  assert.equal(result.semantic.mode,'fallback');assert.equal(result.matches.length,1);
});

test('semantic connection preparation is opt-in, detached and does not contact its endpoint',async t=>{
  let calls=0;const app=await server(t,(_req,res)=>{calls++;reply(res,{});}),dir=directory(t),raw=config(app.url);
  const bundle=prepareAgentBundle({host:'workbuddy',out:path.join(dir,'bundle'),project:dir,retrieval:raw});
  raw.endpoint='http://127.0.0.1:1/changed';assert.equal(bundle.binding.retrieval.endpoint,app.url+'/api/embed');assert.equal(calls,0);
  const plain=prepareAgentBundle({host:'codex',out:path.join(dir,'plain'),project:dir});assert.equal(plain.binding.retrieval,undefined);
  const pm=new PersonaMemory({storage:bundle.binding.storage,persona:bundle.binding.persona,scope:bundle.binding.namespace}),session=createAgentSession(pm,bundle.binding);
  assert.equal((await session.call('memory_status')).retrieval.mode,'optional-semantic');assert.equal(calls,0);
});

test('an Agent rechecks disk after a held semantic request and never returns forgotten or corrected content',async t=>{
  const started=deferred(),held=deferred();let requests=0;
  const app=await server(t,async(_req,res,body)=>{requests++;if(requests===1){started.resolve();await held.promise;}reply(res,{model:'fixture-model',embeddings:body.input.map(vector)});});
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,retrieval:config(app.url)}),binding=bundle.binding;
  const open=()=>new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  const pm=open(),source=pm.putMemory({id:'source',subject:binding.subjects.project,kind:'fact',key:'drink',value:'coffee'});await pm.persist();
  const session=createAgentSession(pm,binding),task=session.call('memory_recall',{scope:'project',query:'咖啡',locale:'zh'});
  await wait(started.promise);const owner=open();owner.putMemory({subject:binding.subjects.project,kind:'fact',key:'drink',value:'tea',replaceId:source.id});await owner.persist();held.resolve();
  const result=await task;assert.equal(result.matches.length,0);assert.equal(result.semantic.reason,'store-changed');assert.equal(requests,1);
});

test('a corrupt snapshot during semantic work fails closed without issuing a cached answer',async t=>{
  const started=deferred(),held=deferred(),app=await server(t,async(_req,res,body)=>{started.resolve();await held.promise;reply(res,{model:'fixture-model',embeddings:body.input.map(vector)});});
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,retrieval:config(app.url)}),b=bundle.binding;
  const pm=new PersonaMemory({storage:b.storage,persona:b.persona,scope:b.namespace});pm.putMemory({subject:b.subjects.project,kind:'fact',key:'drink',value:'coffee'});await pm.persist();
  const session=createAgentSession(pm,b),task=session.call('memory_recall',{scope:'project',query:'coffee'});await wait(started.promise);
  const file=path.join(b.storage,fs.readdirSync(b.storage).find(x=>x.endsWith('.json')));fs.writeFileSync(file,'corrupt synthetic snapshot');held.resolve();
  await assert.rejects(task,{code:'ERR_AGENT_STORE'});await assert.rejects(session.call('memory_status'),{code:'ERR_AGENT_UNAVAILABLE'});
});

test('a real MCP process uses configured embeddings without exposing another bound scope',async t=>{
  const seen=[],app=await server(t,(_req,res,body)=>{seen.push(body.input);reply(res,{model:'fixture-model',embeddings:body.input.map(vector)});});
  const dir=directory(t),bundle=prepareAgentBundle({host:'claude-code',out:path.join(dir,'bundle'),project:dir,userId:'owner',retrieval:config(app.url)}),b=bundle.binding;
  const pm=new PersonaMemory({storage:b.storage,persona:b.persona,scope:b.namespace});pm.putMemory({subject:b.subjects.project,kind:'fact',key:'drink',value:'coffee'});pm.putMemory({subject:b.subjects.personal,kind:'fact',key:'secret',value:'coffee PRIVATE'});await pm.persist();
  const client=await agentClient(t,path.join(bundle.directory,'binding.json'));const result=await client.call('memory_recall',{scope:'project',query:'咖啡',locale:'zh'});
  assert.equal(result.matches[0].record.value,'coffee');assert.equal(seen.flat().join('').includes('PRIVATE'),false);
  const invalid=await client.request('tools/call',{name:'memory_recall',arguments:{scope:'project',query:'coffee',endpoint:'https://example.com'}});
  assert.equal(invalid.result.isError,true);assert.equal(seen.length,1);
  const context=await client.call('memory_context',{scope:'project',query:'café',locale:'fr',budget:2000});
  assert.equal((await client.call('memory_confirm',{contextId:context.contextId,turnId:'used'})).memoryCount,1);await client.close();
});

test('CLI preparation validates complete semantic options before creating output',t=>{
  const dir=directory(t),out=path.join(dir,'bundle');
  const result=spawnSync(process.execPath,['tools/connect.mjs','prepare','--host','codex','--project',dir,'--out',out,'--embedding-provider','ollama','--embedding-model','fixture-model'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).binding.retrieval.provider,'ollama');
  const bad=path.join(dir,'bad');const invalid=spawnSync(process.execPath,['tools/connect.mjs','prepare','--host','codex','--project',dir,'--out',bad,'--embedding-provider','openai-compatible','--embedding-model','fixture-model'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(invalid.status,1);assert.equal(fs.existsSync(bad),false);
});

test('invalid optional credential bytes do not prevent status or local fallback',async t=>{
  let calls=0;const app=await server(t,(_req,res)=>{calls++;reply(res,{});}),dir=directory(t);
  const bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir,retrieval:config(app.url,{apiKeyEnv:'PM_ONLY_SYNTHETIC_BAD_KEY'})}),b=bundle.binding;
  const pm=new PersonaMemory({storage:b.storage,persona:b.persona,scope:b.namespace});pm.putMemory({subject:b.subjects.project,kind:'fact',key:'drink',value:'coffee'});await pm.persist();
  const client=await agentClient(t,path.join(bundle.directory,'binding.json'),{env:{...process.env,PM_ONLY_SYNTHETIC_BAD_KEY:'synthetic\ninvalid'}});
  assert.equal((await client.call('memory_status')).retrieval.mode,'optional-semantic');
  const result=await client.call('memory_recall',{scope:'project',query:'coffee'});assert.equal(result.semantic.mode,'fallback');assert.equal(result.matches.length,1);assert.equal(calls,0);await client.close();
});
