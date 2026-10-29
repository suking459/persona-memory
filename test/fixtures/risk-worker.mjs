import {testTimeout} from '../../tools/test-limits.mjs';
import assert from 'node:assert/strict';
import {PersonaMemory,matchTags,sweepTags} from '../../src/index.js';
import {createTurnRunner} from '../../src/turns.js';
import {createLangChainBridge} from '../../adapters/langchain/index.js';
const mode=process.argv[2];
if(mode==='quotes'){
  const started=performance.now();
  for(const text of ['“'.repeat(100000),'“'.repeat(99998)+'好累','「'.repeat(100000)])assert.deepEqual(matchTags(text),[]);
  assert.ok(performance.now()-started<1000,'quote filtering exceeded its processing budget');
}else if(mode==='repetition'){
  assert.throws(()=>matchTags('不加班'.repeat(25000)),/excessive repeated/);
  assert.throws(()=>matchTags('hi',{x:{words:['']}}),/keyword/);
  const tags=Array.from({length:4096},(_,i)=>({tag:'tag-'+i,longTerm:true,addedAt:1,lastHitAt:1,expiresAt:null,injections:1}));
  assert.equal(sweepTags(tags,2,{maxTagsPerPerson:16}).tags.length,16);
}else if(mode==='recursive'){
  const run=createTurnRunner({timeoutMs:35});
  await assert.rejects(()=>run('recursive','hi',()=>run('recursive','hi',()=>Promise.resolve('unreachable'))),e=>e.code==='ERR_TURN_TIMEOUT');
}else if(mode==='late-result'){
  const pm=new PersonaMemory(),bridge=createLangChainBridge(pm,{chatId:'r',userId:'u',timeoutMs:testTimeout(200)});
  let finish;const pending=bridge.invoke({text:'好累',turnId:'late'},()=>new Promise(resolve=>{finish=resolve;}));
  await assert.rejects(pending,e=>e.code==='ERR_TURN_TIMEOUT');
  finish('late');await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(pm.diagnostics().confirmedTurns,0);
}else if(mode==='bounded-wait'){
  const run=createTurnRunner({limit:1,timeoutMs:30});
  await assert.rejects(()=>run('stuck','hi',()=>new Promise(()=>{})),e=>e.code==='ERR_TURN_TIMEOUT');
  await assert.rejects(()=>run('another','hi',()=>Promise.resolve('x')),/too many concurrent/);
}else if(mode==='saturation'){
  let now=Date.UTC(2026,0,1);const pm=new PersonaMemory({clock:()=>now,config:{maxProfiles:64,maxVisitors:32,dedupeLimit:128,historyLimit:32}});
  for(let i=0;i<20000;i++){now++;pm.ingest({chatId:'r',userId:'visitor-'+i,text:'hello',eventId:'m'+i});}
  for(let i=0;i<64;i++){now++;pm.ingest({chatId:'r',userId:'member-'+i,text:'你好',directedToBot:true});}
  const before=pm.export();
  assert.throws(()=>pm.ingest({chatId:'r',userId:'overflow',text:'你好',directedToBot:true,eventId:'overflow'}),e=>e.code==='ERR_MEMORY_CAPACITY');
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.diagnostics().visitors,32);assert.equal(pm.diagnostics().profiles,64);assert.ok(pm.diagnostics().dedupeEntries<=128);
}else throw new Error('unknown case');
console.log(JSON.stringify({case:mode,completed:true}));
