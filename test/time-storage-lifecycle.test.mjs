import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';
test('two actual processes cannot both commit from the same JSON revision',{timeout:15000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-store-race-'));
  const worker=fileURLToPath(new URL('./fixtures/store-race-worker.mjs',import.meta.url)),children=[];
  t.after(()=>{
    for(const child of children)child.kill();
    const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('pm-store-race-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const ready=[],outcomes=[];
  for(const id of ['a','b']){
    const child=fork(worker,[dir,id],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});children.push(child);
    ready.push(new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(new Error('worker exited before ready: '+code)));child.once('message',resolve);}));
    outcomes.push(new Promise((resolve,reject)=>{child.on('error',reject);child.once('exit',code=>reject(new Error('worker exited before result: '+code)));child.on('message',message=>{if(message!=='ready')resolve(message);});}));
  }
  const timer=setTimeout(()=>{for(const child of children)child.kill();},10000);
  try{
    await Promise.all(ready);for(const child of children)child.send('commit');
    const results=await Promise.all(outcomes);assert.equal(results.filter(row=>row.ok).length,1);
    assert.ok(results.filter(row=>!row.ok).every(row=>['ERR_STORE_CONFLICT','ERR_STORE_LOCKED'].includes(row.code)));
    await Promise.all(children.map(child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve))));
    const restored=new PersonaMemory({storage:dir,clock:()=>1000});assert.equal(restored.diagnostics().memories,1);
    assert.deepEqual(fs.readdirSync(dir),['default.json']);
  }finally{clearTimeout(timer);}
});
test('external watchdog bounds 1000-record transfer, idempotent preview and excessive input',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./fixtures/time-storage-worker.mjs',import.meta.url))],
    {encoding:'utf8',timeout:testTimeout(10000),windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{imported:1000,retryUnchanged:1000,oversizedRejected:true});
});
test('seeded scheduling and history replay agrees with an independent bounded temporal oracle',()=>{
  const subject={type:'task',id:'timeline'};
  for(const start of [1987,71289,91827]){
    let seed=start,now=1000,head=null;const all=[],maxVersionsPerMemory=8;
    const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n;};
    const pm=new PersonaMemory({clock:()=>now,config:{maxVersionsPerMemory}});
    let writes=0,queries=0,rejections=0;
    for(let step=0;step<500;step++){
      now+=1+random(20);const before=pm.export();
      if(random(3)===0){
        const validFrom=Math.max(head?.validFrom??0,now+random(3)*20);
        try{
          const record=pm.putMemory({id:'v'+step,subject,kind:'decision',key:'phase',value:step,validFrom,
            ...(head?{replaceId:head.id,expectedRevision:head.revision}:{expectedRevision:0})});
          head=record;all.push(record);writes++;
        }catch(error){assert.equal(error.code,'ERR_MEMORY_CAPACITY');assert.deepEqual(pm.export(),before);rejections++;}
      }else{
        const knownAt=1000+random(now-999),at=1000+random(now-900);
        const expected=[...all].reverse().find(record=>record.createdAt<=knownAt && record.validFrom<=at);
        const retained=expected && Object.hasOwn(pm.export().memories,expected.id);
        const actual=pm.getMemoryAt({subject,kind:'decision',key:'phase',at,knownAt});
        assert.equal(actual?.id??null,retained?expected.id:null,'seed '+start+' step '+step);queries++;
      }
      if(step%10===0){const restored=new PersonaMemory({clock:()=>now,config:{maxVersionsPerMemory}});restored.import(pm.export());assert.deepEqual(restored.export(),pm.export());}
      assert.ok(pm.diagnostics().memories<=maxVersionsPerMemory);
    }
    assert.ok(writes>100&&queries>250);assert.ok(rejections<100);
  }
});
