import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createLangChainBridge} from '../adapters/langchain/index.js';
import {createLlamaIndexBridge} from '../adapters/llamaindex/index.js';
test('successful and concurrent bridge retries share one model invocation',async()=>{
 const pm=new PersonaMemory(),bridge=createLangChainBridge(pm,{chatId:'r',userId:'u'});
 let calls=0;const call=async()=>{calls++;return 'ok';};
 const input={text:'好累',turnId:'one'};
 await Promise.all([bridge.invoke(input,call),bridge.invoke(input,call)]);
 await bridge.invoke(input,call);assert.equal(calls,1);
 assert.equal(pm.getProfile('r','u').tags[0].injections,1);
 await assert.rejects(()=>bridge.invoke({...input,text:'different'},call),/different input/);
});
test('failed model call can retry without duplicating LlamaIndex input history',async()=>{
 const {Memory}=await import('@llamaindex/core/memory');
 const memory=new Memory(),pm=new PersonaMemory(),bridge=createLlamaIndexBridge(pm,{memory,chatId:'r',userId:'u'});
 const input={text:'好累',turnId:'retry'};
 await assert.rejects(()=>bridge.invoke({...input,call:async()=>{throw new Error('temporary model failure');}}),/temporary/);
 assert.equal(pm.getProfile('r','u').tags[0].injections,0);
 await bridge.invoke({...input,call:async()=> 'ok'});
 const messages=await memory.get({type:'llamaindex'});
 assert.equal(messages.filter(m=>m.role==='user').length,1);
 assert.equal(messages.filter(m=>m.role==='assistant').length,1);
});

test("correction during a model call returns response with honest usage status",async()=>{
 const pm=new PersonaMemory(),bridge=createLangChainBridge(pm,{chatId:"r",userId:"u"});
 const result=await bridge.invoke({text:"好累",turnId:"correct"},async()=>{pm.setTag({chatId:"r",userId:"u",tag:"已确认",source:"host"});return "ok";});
 assert.equal(result.response,"ok");assert.equal(result.usage.reason,"context-unavailable");
});
