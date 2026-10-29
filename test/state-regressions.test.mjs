import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {PersonaMemory, sweepTags, hitTag} from '../src/index.js';
import {createLlamaIndexBridge} from '../adapters/llamaindex/index.js';

const DAY=86400000;
function usedLongTermTag() {
  let now=0;
  const pm=new PersonaMemory({clock:()=>now});
  pm.setTag({chatId:'room',userId:'user',tag:'preference',expiresAt:null});
  for(let i=0;i<6;i++) {
    const context=pm.buildContext({chatId:'room',userIds:['user']});
    assert.equal(pm.confirmContext(context,{turnId:'use-'+i}).tagCount,1);
  }
  return {pm,at(time){now=time;},tag(){return pm.getProfile('room','user').tags[0];}};
}

test('daily maintenance expires an idle demoted tag without reviving old evidence',()=>{
  const {pm,at,tag}=usedLongTermTag();
  at(8*DAY);
  assert.equal(pm.maintain().demoted,1);
  assert.equal(tag().longTerm,false);
  assert.equal(tag().lastEvidenceAt,0);
  at(9*DAY);
  assert.equal(pm.maintain().promoted,0);
  assert.equal(tag().longTerm,false);
  assert.equal(tag().lastEvidenceAt,0);
  at(10*DAY);
  assert.equal(pm.maintain().expired,1);
  for(let day=11;day<=30;day++) {
    at(day*DAY);
    assert.equal(pm.maintain().promoted,0);
    assert.equal(tag(),undefined);
  }
});

test('fresh evidence allows a demoted tag to become long term again',()=>{
  const {pm,at,tag}=usedLongTermTag();
  at(8*DAY);
  pm.maintain();
  at(9*DAY);
  pm.setTag({chatId:'room',userId:'user',tag:'preference',source:'host',eventId:'new-evidence'});
  assert.equal(tag().longTerm,true);
  assert.equal(tag().lastEvidenceAt,9*DAY);
  assert.equal(tag().addedAt,0);
  at(16*DAY);
  assert.equal(pm.maintain().demoted,0);
  at(16*DAY+1);
  assert.equal(pm.maintain().demoted,1);
  assert.equal(tag().lastEvidenceAt,9*DAY);
});

test('promotion preserves the supplied evidence timestamp',()=>{
  const now=10*DAY;
  const result=sweepTags([{tag:'preference',addedAt:0,lastHitAt:2*DAY,lastEvidenceAt:9*DAY,
    expiresAt:11*DAY,longTerm:false,hits:2,injections:6}],now);
  assert.equal(result.promoted,1);
  assert.equal(result.tags[0].lastEvidenceAt,9*DAY);
});

test('LlamaIndex history arriving after timeout cannot start the model call',async()=>{
  let releaseHistory,modelCalls=0;
  const added=[];
  const memory={
    async add(message){added.push(message);},
    get(){return new Promise(resolve=>{releaseHistory=resolve;});},
  };
  const pm=new PersonaMemory();
  const bridge=createLlamaIndexBridge(pm,{memory,chatId:'room',userId:'user',timeoutMs:testTimeout(200)});
  await assert.rejects(bridge.invoke({text:'hello',turnId:'late-history',call:async()=>{
    modelCalls++;return 'late response';
  }}),{code:'ERR_TURN_TIMEOUT'});
  assert.equal(typeof releaseHistory,'function');
  assert.equal(modelCalls,0);
  releaseHistory([{role:'user',content:'hello'}]);
  await nextTurn();
  assert.equal(modelCalls,0);
  assert.deepEqual(added,[{role:'user',content:'hello'}]);
  assert.equal(pm.diagnostics().confirmedTurns,0);
});
test('a host can correct advice for an existing tag without mutating reducer input',()=>{
  const original=[{tag:'preference',advice:'old advice',addedAt:0,lastHitAt:0,lastEvidenceAt:0,
    expiresAt:2*DAY,longTerm:false,hits:1,injections:0}];
  const updated=hitTag(original,'preference','corrected advice',DAY);
  assert.equal(updated[0].advice,'corrected advice');
  assert.equal(original[0].advice,'old advice');
  assert.equal(original[0].hits,1);
  const pm=new PersonaMemory({clock:()=>0});
  pm.setTag({chatId:'room',userId:'user',tag:'preference',advice:'old advice'});
  pm.setTag({chatId:'room',userId:'user',tag:'preference',advice:'corrected advice',source:'host'});
  assert.equal(pm.getProfile('room','user').tags[0].advice,'corrected advice');
});