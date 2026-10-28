import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {PersonaMemory} from '../src/index.js';
import {createMemoryServer} from '../adapters/http/server.js';
import {handleMcp} from '../adapters/mcp/server.js';
import {parseDiscord} from '../adapters/discord/index.js';
import {parseOneBot} from '../adapters/onebot/index.js';
import {createLangChainBridge} from '../adapters/langchain/index.js';
import {createLlamaIndexBridge} from '../adapters/llamaindex/index.js';

test('HTTP preserves core flags, previews are pure, admin is opt-in',async()=>{
  const pm=new PersonaMemory(),server=createMemoryServer({pm,token:'test-only'});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const post=async(route,body,token='test-only')=>{
    const r=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  try{
    assert.equal((await post('/api/ingest',{},'wrong')).status,401);
    const input={chatId:'r',userId:'u',text:'好累',mentionsSelf:true,eventId:'1'};
    const core=new PersonaMemory();const direct=core.ingest(input);
    const http=await post('/api/ingest',input);assert.equal(http.body.delta,direct.delta);
    const before=pm.export(),c=await post('/api/context',{chatId:'r',userIds:['u']});
    assert.deepEqual(pm.export(),before);
    assert.equal((await post('/api/confirm',{contextId:c.body.context.contextId,turnId:'turn'})).body.tagCount,1);
    assert.equal((await post('/api/tags',{chatId:'r',userId:'u',tag:'x'})).status,403);
    assert.equal((await post('/api/ingest',{chatId:'r',userId:'u',ts:'nonsense'})).status,400);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('MCP handshake, record, preview and acknowledgement follow the same semantics',async()=>{
  const pm=new PersonaMemory();
  const request=(id,method,params)=>handleMcp({jsonrpc:'2.0',id,method,params},pm);
  assert.equal((await request(1,'initialize',{protocolVersion:'2025-06-18'})).result.protocolVersion,'2025-06-18');
  assert.equal(await handleMcp({jsonrpc:'2.0',method:'notifications/initialized'},pm),null);
  await request(2,'tools/call',{name:'memory_record',arguments:{chatId:'r',userId:'u',text:'好累',mentionsSelf:true}});
  const r=await request(3,'tools/call',{name:'memory_context',arguments:{chatId:'r',userIds:['u']}});
  const context=JSON.parse(r.result.content[0].text);
  assert.equal(pm.getProfile('r','u').tags[0].injections,0);
  const ack=await request(4,'tools/call',{name:'memory_confirm',arguments:{contextId:context.contextId,turnId:'t'}});
  assert.equal(JSON.parse(ack.result.content[0].text).tagCount,1);
});
test('Discord fixture normalizes mention, reply, scope and self messages',()=>{
  const event={id:'m1',guildId:'guild',channelId:'channel',author:{id:'person',bot:false},content:'hi',createdTimestamp:123,mentions:{users:new Map([['bot',{}]]),repliedUser:{id:'bot'}}};
  const r=parseDiscord(event,{selfId:'bot'});
  assert.equal(r.mentionsSelf,true);assert.equal(r.replyToSelf,true);assert.equal(r.chatId,'discord:guild:channel');
  assert.equal(parseDiscord({...event,author:{id:'bot',bot:true}},{selfId:'bot'}),null);
});
test('OneBot explicit flags survive ingestion',()=>{
  const r=parseOneBot({post_type:'message',message_type:'group',group_id:1,self_id:2,user_id:3,time:123,message:[{type:'at',data:{qq:'2'}},{type:'text',data:{text:' hi'}}]});
  assert.equal(new PersonaMemory().ingest(r).delta,2);
});
test('real LangChain Runnable receives relationship context',async()=>{
  const {RunnableLambda}=await import('@langchain/core/runnables');
  const pm=new PersonaMemory(),bridge=createLangChainBridge(pm,{chatId:'r',userId:'u'});
  const model=RunnableLambda.from(input=>input.persona_memory);
  const chain=RunnableLambda.from(input=>bridge.invoke(input,v=>model.invoke(v)));
  const r=await chain.invoke({text:'今天好累',turnId:'run'});
  assert.match(r.response,/最近很累/);assert.equal(pm.getProfile('r','u').tags[0].injections,1);
});
test('real LlamaIndex Memory supplies history plus relationship context',async()=>{
  const {Memory}=await import('@llamaindex/core/memory');
  const pm=new PersonaMemory(),memory=new Memory();
  const bridge=createLlamaIndexBridge(pm,{memory,chatId:'r',userId:'u'});
  let received;
  await bridge.invoke({text:'今天好累',turnId:'run',call:async messages=>{received=messages;return '收到';}});
  assert.equal(received[0].role,'system');assert.match(received[0].content,/最近很累/);
  assert.ok(received.some(m=>m.role==='user' && m.content==='今天好累'));
  assert.equal(pm.getProfile('r','u').tags[0].injections,1);
});
