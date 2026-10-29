import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createMemoryBridge} from '../adapters/memory/index.js';
const pm=new PersonaMemory({scope:'retrieval-example',clock:()=>1000});
const project={type:'project',id:'project-a'},owner={type:'user',id:'owner'};

pm.putMemory({subject:project,kind:'constraint',key:'发布要求',value:'只在 1.0 完整验收后统一发布',source:'user'});
pm.putMemory({subject:owner,kind:'preference',key:'回答格式',value:'中文、简短、自然',source:'user'});
pm.putMemory({subject:{type:'project',id:'other-project'},kind:'fact',key:'发布要求',value:'其他项目的数据',source:'host'});

const bridge=createMemoryBridge(pm,{subjects:[project,owner],budget:2000});
const result=await bridge.invoke({text:'这个项目什么时候发布？',turnId:'example-1'},async({memory})=>{
  assert.match(memory,/1.0/);
  assert.ok(!memory.includes('其他项目的数据'));
  assert.ok(!memory.includes('回答格式'));
  // Replace this callback with the application's real model call and pass memory as reference data.
  return '按项目要求，完整验收后统一发布 1.0。';
});
assert.equal(result.usage.memoryCount,1);
console.log(JSON.stringify({mode:'mechanism-demo-not-model-evaluation',response:result.response,
  selected:result.context.records.map(hit=>({key:hit.record.key,reasons:hit.reasons})),usage:result.usage},null,2));
