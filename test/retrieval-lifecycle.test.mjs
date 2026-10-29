import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {evaluateRetrieval} from '../tools/evaluate-retrieval.mjs';

test('classified cross-application retrieval cases match their declared policy labels',()=>{
  const report=evaluateRetrieval();
  assert.deepEqual(report.failures,[]);
  assert.ok(report.cases>=30);assert.equal(report.passed,report.cases);
});

test('external watchdog bounds long-record retrieval and full-context rendering',()=>{
  const worker=fileURLToPath(new URL('./fixtures/retrieval-worker.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[worker],{encoding:'utf8',windowsHide:true,timeout:testTimeout(10000),maxBuffer:1048576});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes('"completed":true'));
});

test('mixed retrieval, acknowledgement, replacement and deletion remains bounded and restorable',()=>{
  for(const initialSeed of [1729,92837,81271]){
    let now=1000,seed=initialSeed;
    const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n;};
    const config={maxMemories:48,dedupeLimit:32,historyLimit:32},pm=new PersonaMemory({clock:()=>now,config});
    const previews=[],coverage=Array(6).fill(0);
    for(let i=0;i<700;i++){
      now+=random(20)+1;
      const subject={type:['user','project','task'][random(3)],id:'s'+random(3)},key='k'+random(4);
      const operation=random(6);coverage[operation]++;
      const before=pm.export();
      try{
        switch(operation){
          case 0:{
            const current=pm.listMemories({subject,key,kind:'fact'})[0];
            pm.putMemory({id:'id'+random(36),subject,kind:'fact',key,value:{release:i},
              ...(current?{replaceId:current.id}:{}),...(random(2)?{expiresAt:now+random(60)}:{})});break;
          }
          case 1:{
            const preview=pm.buildMemoryContext({subject,query:'release',budget:1000,maxRecords:2});
            assert.deepEqual(pm.export(),before);previews.push(preview);if(previews.length>160)previews.shift();break;
          }
          case 2:
            if(previews.length)pm.confirmContext(previews[random(previews.length)],{turnId:'t'+i});break;
          case 3:pm.forgetMemory('id'+random(36));break;
          case 4:pm.maintain();break;
          case 5:pm.deleteSubject(subject);break;
        }
      }catch(error){
        assert.ok(['ERR_MEMORY_CONFLICT','ERR_MEMORY_CAPACITY'].includes(error.code) || /unknown or expired|confirmation expired/.test(error.message),error.stack);
        assert.deepEqual(pm.export(),before);
      }
      assert.ok(pm._pending.size<=128 && pm.diagnostics().confirmedTurns<=32);
      if(i%10===0){const restored=new PersonaMemory({clock:()=>now,config});restored.import(pm.export());assert.deepEqual(restored.export(),pm.export());}
    }
    assert.ok(coverage.every(count=>count>50),JSON.stringify(coverage));
  }
});

test('usage snapshots reject excessive or malformed new metadata atomically',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),subject={type:'project',id:'p'};
  pm.putMemory({subject,kind:'fact',key:'release',value:'1.0'});
  pm.confirmContext(pm.buildMemoryContext({subject,budget:2000}),{turnId:'one'});
  const before=pm.export();
  for(const mutate of [
    snapshot=>{snapshot.uses[0].recordIds=Array(65).fill('id');},
    snapshot=>{snapshot.uses[0].recordIds=[null];},
    snapshot=>{snapshot.uses[0].memorySubjects=Array(33).fill(subject);},
    snapshot=>{snapshot.uses[0].memorySubjects=[{type:'unknown',id:'p'}];},
  ]){
    const bad=structuredClone(before);mutate(bad);
    assert.throws(()=>pm.import(bad));assert.deepEqual(pm.export(),before);
  }
});

test('expiry before acknowledgement does not refresh the record and importing invalidates previews',()=>{
  let now=1000;
  const pm=new PersonaMemory({clock:()=>now}),subject={type:'project',id:'p'};
  const record=pm.putMemory({subject,kind:'state',key:'release',value:'ready',expiresAt:1010});
  const context=pm.buildMemoryContext({subject,budget:2000});now=1011;
  assert.equal(pm.confirmContext(context,{turnId:'expired'}).memoryCount,0);
  assert.equal(pm.getMemory(record.id,{includeInactive:true}).expiresAt,1010);
  const pending=pm.buildMemoryContext({subject,budget:2000});
  pm.import(pm.export());assert.throws(()=>pm.confirmContext(pending,{turnId:'restart'}),/unknown or expired/);
});
