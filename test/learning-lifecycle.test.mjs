import {testTimeout} from '../tools/test-limits.mjs';
import fs from 'node:fs';
import {evaluateLearning} from '../tools/evaluate-learning.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
test('external watchdog bounds recursive extraction and saturated candidate retries',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/learning-worker.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{recursiveTimeout:true,boundedCandidates:64,pureRetries:500});
});
test('fixed-seed review, correction, expiry and deletion replay stays atomic and restorable',()=>{
  for(const start of [1729,81173,98321]){
    let now=1000,seed=start;const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n;};
    const config={maxCandidates:32,maxMemories:24,maxVersionsPerMemory:4,candidateTtlHours:1},pm=new PersonaMemory({clock:()=>now,config}),coverage=new Array(8).fill(0);
    for(let step=0;step<700;step++){
      now+=1+random(30000);const operation=random(8);coverage[operation]++;
      const subject={type:['user','project','task'][random(3)],id:'s'+random(2)},list=Object.values(pm.export().candidates),selected=list[random(Math.max(1,list.length))],before=pm.export();
      try{
        switch(operation){
          case 0:pm.proposeMemory({memory:{subject,kind:'fact',key:'field'+random(3),value:random(5),evidenceId:'e'+random(6)}});break;
          case 1:if(selected)pm.acceptCandidate(selected.id,{expectedRevision:selected.revision});break;
          case 2:if(selected)pm.rejectCandidate(selected.id,{expectedRevision:selected.revision,reason:'not confirmed'});break;
          case 3:if(selected)pm.reviseCandidate(selected.id,{expectedRevision:selected.revision,memory:{value:random(5),observedAt:now}});break;
          case 4:pm.maintain();break;
          case 5:pm.deleteSubject(subject);break;
          case 6:if(selected)pm.forgetCandidate(selected.id);break;
          case 7:{const prior=pm.listMemories({subject,kind:'fact',key:'field0'})[0];pm.putMemory({subject,kind:'fact',key:'field0',value:'host correction',...(prior?{replaceId:prior.id}:{})});break;}
        }
      }catch(error){
        assert.ok(['ERR_CANDIDATE_CONFLICT','ERR_MEMORY_CONFLICT','ERR_MEMORY_CAPACITY'].includes(error.code),error.stack);assert.deepEqual(pm.export(),before);
      }
      const copy=new PersonaMemory({config,clock:()=>now});copy.import(pm.export());assert.deepEqual(copy.export(),pm.export());
      assert.ok(pm.diagnostics().candidates<=32);assert.ok(pm.diagnostics().memories<=24);
    }
    assert.ok(coverage.every(count=>count>50),JSON.stringify(coverage));
  }
});

test('an actual 0.8 schema 4 snapshot preserves future activation when migrating to schema 5',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-0.8.json',import.meta.url)));assert.equal(fixture.snapshot.schemaVersion,4);
  let now=1000;const pm=new PersonaMemory({clock:()=>now});pm.import(fixture.snapshot);assert.equal(pm.export().schemaVersion,5);
  assert.equal(pm.getMemory('old-current').value,'preview');assert.equal(pm.getMemory('old-future'),null);
  now=2000;assert.equal(pm.getMemory('old-future').value,'stable');assert.equal(pm.diagnostics().candidates,0);
});
test('classified synthetic continuity scenarios pass their host policy assertions',async()=>{
  const report=await evaluateLearning();assert.equal(report.scenarios,4);assert.equal(report.passed,4);assert.ok(report.checks>=18);
});
