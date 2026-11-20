import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createMemoryBridge} from '../adapters/memory/index.js';
const pm=new PersonaMemory({scope:'retrieval-example',clock:()=>1000});
const project={type:'project',id:'project-a'},owner={type:'user',id:'owner'};

pm.putMemory({subject:project,kind:'constraint',key:'release-policy',value:'Release 1.0 only after complete validation.',source:'user'});
pm.putMemory({subject:owner,kind:'preference',key:'response-format',value:'Brief and natural replies.',source:'user'});
pm.putMemory({subject:{type:'project',id:'other-project'},kind:'fact',key:'release-policy',value:'Other project data',source:'host'});

const bridge=createMemoryBridge(pm,{subjects:[project,owner],budget:2000});
const result=await bridge.invoke({text:'What is the release-policy for this project?',turnId:'example-1'},async({memory})=>{
  assert.match(memory,/1.0/);
  assert.ok(!memory.includes('Other project data'));
  assert.ok(!memory.includes('response-format'));
  // Replace this callback with the application's real model call and pass memory as reference data.
  return 'Release 1.0 after complete project validation.';
});
assert.equal(result.usage.memoryCount,1);
console.log(JSON.stringify({mode:'mechanism-demo-not-model-evaluation',response:result.response,
  selected:result.context.records.map(hit=>({key:hit.record.key,reasons:hit.reasons})),usage:result.usage},null,2));
