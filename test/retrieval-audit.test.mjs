import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createMemoryBridge} from '../adapters/memory/index.js';
const subject={type:'project',id:'audit'};

test('version-number queries do not match other versions through a shared numeric fragment',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  pm.putMemory({id:'one',subject,kind:'fact',key:'first-version',value:'1.0'});
  pm.putMemory({id:'two',subject,kind:'fact',key:'second-version',value:'2.0'});
  assert.deepEqual(pm.searchMemories({subject,query:'1.0'}).matches.map(hit=>hit.record.id),['one']);
});

test('generic bridge preserves an explicitly supplied preview time',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  pm.putMemory({subject,kind:'fact',key:'release',value:'1.0'});
  const bridge=createMemoryBridge(pm,{subject,now:999,budget:2000});
  const result=await bridge.invoke({text:'release',turnId:'past-preview'},input=>input.memory);
  assert.equal(result.response,'');assert.equal(result.usage.memoryCount,0);
});

test('combined acknowledgement enforces one bounded set of selected records before mutating state',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  for(let i=0;i<65;i++)pm.putMemory({subject,kind:'fact',key:'k'+i,value:'release'});
  const groups=[Array.from({length:32},(_,i)=>'k'+i),Array.from({length:32},(_,i)=>'k'+(i+32)),['k64']];
  const contexts=groups.map(keys=>pm.buildMemoryContext({subject,keys,budget:100000,maxRecords:64}));
  const before=pm.export();
  assert.throws(()=>pm.confirmContexts(contexts,{turnId:'oversized-bundle'}),/limit/);
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.confirmContext(contexts[0],{turnId:'bounded'}).memoryCount,32);
});

test('combined acknowledgement also bounds empty-result subject metadata',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  const a=pm.buildMemoryContext({subjects:Array.from({length:32},(_,i)=>({type:'project',id:'p'+i}))});
  const b=pm.buildMemoryContext({subject:{type:'project',id:'p32'}});
  const before=pm.export();
  assert.throws(()=>pm.confirmContexts([a,b],{turnId:'too-many-subjects'}),/limit/);
  assert.deepEqual(pm.export(),before);
});

test('an unconsumed model stream is not treated as a completed successful response',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  pm.putMemory({subject,kind:'fact',key:'release',value:'1.0'});
  const bridge=createMemoryBridge(pm,{subject,budget:2000});
  let signal;
  await assert.rejects(()=>bridge.invoke({text:'release',turnId:'stream'},(_input,options)=>{
    signal=options.signal;
    return (async function*(){yield 'partial';throw new Error('stream failed');})();
  }),/stream.*completion|consume.*stream/i);
  assert.equal(pm.diagnostics().confirmedTurns,0);
  assert.equal(signal.aborted,true);
  const result=await bridge.invoke({text:'release',turnId:'stream'},()=> 'complete');
  assert.equal(result.usage.memoryCount,1);
});

test('the final tokenizer result cannot exceed budget, even for an empty context',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  assert.throws(()=>pm.buildMemoryContext({subject,tokenBudget:0,countTokens:()=>1}),/token budget/);
  assert.throws(()=>pm.buildContext({chatId:'r',userIds:[],tokenBudget:0,countTokens:()=>1}),/token budget/);
  assert.equal(pm._pending.size,0);
});

test('equivalent trimmed turn IDs share one model request and invalid IDs fail before calling a model',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'fact',key:'release',value:'1.0'});
  const bridge=createMemoryBridge(pm,{subject,budget:2000});let calls=0;
  const call=async()=>{calls++;return 'ok';};
  await Promise.all([bridge.invoke({text:'release',turnId:'same'},call),bridge.invoke({text:'release',turnId:' same '},call)]);
  assert.equal(calls,1);
  for(const turnId of ['constructor','bad\nid',' '])await assert.rejects(()=>bridge.invoke({text:'release',turnId},call),/turnId/);
  assert.equal(calls,1);
});

test('a caller mutating its input object during the model await cannot change acknowledgement identity',async()=>{
  const pm=new PersonaMemory({clock:()=>1000});pm.putMemory({subject,kind:'fact',key:'release',value:'1.0'});
  const bridge=createMemoryBridge(pm,{subject,budget:2000}),input={text:'release',turnId:'original'};
  let finish;
  const promise=bridge.invoke(input,()=>new Promise(resolve=>{finish=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));
  input.turnId='mutated';finish('done');await promise;
  assert.equal(pm.export().uses[0].turnId,'original');
  assert.equal(pm.diagnostics().confirmedTurns,1);
});
