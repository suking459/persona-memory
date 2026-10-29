import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createMemoryServer} from '../adapters/http/server.js';
import {handleMcp} from '../adapters/mcp/server.js';
import {createMemoryBridge} from '../adapters/memory/index.js';

const subject={type:'project',id:'work'};
const put=pm=>pm.putMemory({subject,kind:'constraint',key:'发布要求',value:'1.0 统一发布',source:'user'});

test('HTTP exposes typed retrieval and opt-in management through the same confirmation path',async t=>{
  const pm=new PersonaMemory({clock:()=>1000});
  const server=createMemoryServer({pm,allowAdmin:true,token:'local-test'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const endpoint='http://127.0.0.1:'+server.address().port;
  const post=async(path,body,auth=true)=>{
    const response=await fetch(endpoint+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer local-test'}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  assert.equal((await post('/api/memory/search',{subject},false)).status,401);
  const record=(await post('/api/memory/put',{subject,kind:'constraint',key:'发布要求',value:'1.0 统一发布'})).body.memory;
  const conflict=await post('/api/memory/put',{subject,kind:'constraint',key:'发布要求',value:'premature release'});
  assert.equal(conflict.status,409);assert.equal(conflict.body.code,'ERR_MEMORY_CONFLICT');
  const search=await post('/api/memory/search',{subject,query:'什么时候发布'});
  assert.equal(search.status,200);assert.equal(search.body.matches[0].record.id,record.id);
  const preview=await post('/api/memory/context',{subject,query:'发布',budget:2000});
  assert.match(preview.body.block,/1.0/);
  assert.equal((await post('/api/confirm',{contextId:preview.body.context.contextId,turnId:'http'})).body.memoryCount,1);
  assert.equal((await post('/api/memory/get',{id:record.id})).body.memory.value,'1.0 统一发布');
  assert.equal((await post('/api/memory/forget',{id:record.id})).body.removed,1);
  assert.equal(pm.diagnostics().confirmedTurns,0);
});

test('HTTP typed writes remain disabled unless explicitly enabled',async t=>{
  const server=createMemoryServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/memory/put',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subject,kind:'fact',key:'x',value:'y'}),
  });
  assert.equal(response.status,403);
});

test('MCP typed record tools search, preview and acknowledge without adding model-written facts',async()=>{
  const pm=new PersonaMemory({clock:()=>1000}),record=put(pm);
  const call=async(name,args,id)=>handleMcp({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}},pm);
  const listing=await handleMcp({jsonrpc:'2.0',id:0,method:'tools/list'},pm);
  assert.ok(listing.result.tools.some(tool=>tool.name==='memory_search_records'));
  assert.ok(!listing.result.tools.some(tool=>tool.name==='memory_put'));
  const search=JSON.parse((await call('memory_search_records',{subject,query:'发布'},1)).result.content[0].text);
  assert.equal(search.matches[0].record.id,record.id);
  const context=JSON.parse((await call('memory_records_context',{subject,query:'发布',budget:2000},2)).result.content[0].text);
  const acknowledgement=JSON.parse((await call('memory_confirm_contexts',{contextIds:[context.contextId],turnId:'mcp'},3)).result.content[0].text);
  assert.equal(acknowledgement.memoryCount,1);
  assert.equal((await call('memory_search_records',{query:'发布'},4)).result.isError,true);
});

test('generic model bridge supplies retrieved context and shares concurrent retries',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});put(pm);
  const bridge=createMemoryBridge(pm,{subject,budget:2000});
  let calls=0;
  const call=async(values,{signal})=>{calls++;assert.equal(signal.aborted,false);assert.match(values.memory,/1.0 统一发布/);return 'received';};
  const input={text:'什么时候发布',turnId:'generic'};
  const [a,b]=await Promise.all([bridge.invoke(input,call),bridge.invoke(input,call)]);
  assert.equal(a.response,'received');assert.equal(b.usage.memoryCount,1);assert.equal(calls,1);
  await bridge.invoke(input,call);assert.equal(calls,1);assert.equal(pm.diagnostics().profiles,0);
  await assert.rejects(()=>bridge.invoke({...input,query:'其他'},call),/different input/);
});

test('failed generic model calls do not confirm memory and can retry with fresh context',async()=>{
  const pm=new PersonaMemory({clock:()=>1000}),first=put(pm);
  const bridge=createMemoryBridge(pm,{subject,budget:2000});
  await assert.rejects(()=>bridge.invoke({text:'发布',turnId:'retry'},async()=>{throw new Error('model failed');}),/model failed/);
  assert.equal(pm.diagnostics().confirmedTurns,0);
  pm.putMemory({subject,kind:'constraint',key:'发布要求',value:'1.1 发布',replaceId:first.id});
  const result=await bridge.invoke({text:'发布',turnId:'retry'},values=>values.memory);
  assert.match(result.response,/1.1/);assert.equal(result.usage.memoryCount,1);
});

test('generic bridge late results and mid-call deletion cannot acknowledge stale memory',async()=>{
  const pm=new PersonaMemory({clock:()=>1000}),record=put(pm);
  const bridge=createMemoryBridge(pm,{subject,budget:2000,timeoutMs:10});
  let finish;
  const invocation=bridge.invoke({text:'发布',turnId:'late'},()=>new Promise(resolve=>{finish=resolve;}));
  await assert.rejects(invocation,{code:'ERR_TURN_TIMEOUT'});
  finish('late');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pm.diagnostics().confirmedTurns,0);
  const next=createMemoryBridge(pm,{subject,budget:2000});
  const result=await next.invoke({text:'发布',turnId:'deleted'},()=>{
    pm.forgetMemory(record.id);return 'response already produced';
  });
  assert.equal(result.response,'response already produced');
  assert.equal(result.usage.reason,'context-unavailable');assert.equal(result.usage.memoryCount,0);
});
