import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory} from '../src/index.js';
import {createPreset} from '../src/presets.js';
const worker=fileURLToPath(new URL('./fixtures/risk-worker.mjs',import.meta.url));
for(const mode of ['quotes','repetition','recursive','late-result','bounded-wait','saturation']){
  test('external watchdog: '+mode,()=>{
    const result=spawnSync(process.execPath,[worker,mode],{encoding:'utf8',windowsHide:true,timeout:testTimeout(10000),maxBuffer:1048576});
    assert.equal(result.error,undefined,'worker exceeded the OS deadline');
    assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('"completed":true'));
  });
}
test('fixed-seed mixed lifecycle replay remains bounded and migration-consistent',()=>{
 let now=Date.UTC(2026,0,1),seed=92837;
 const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const config=createPreset('npc',{maxProfiles:64,maxVisitors:32,dedupeLimit:128,historyLimit:32});
 const pm=new PersonaMemory({clock:()=>now,config});
 for(let i=0;i<1500;i++){
  now+=random(10000)+1;const chatId='c'+random(4),userId='u'+random(16),tag='s'+random(8);
  switch(random(6)){
   case 0:pm.ingest({chatId,userId,text:['你好','今天好累','我不是在找工作','“发烧”'][random(4)],directedToBot:true,eventId:'e'+i});break;
   case 1:pm.setTag({chatId,userId,tag,source:'host'});break;
   case 2:pm.removeTag({chatId,userId,tag});break;
   case 3:pm.maintain();break;
   case 4:{const before=pm.export(),c=pm.buildContext({chatId,userIds:[userId],maxPeople:1,budget:120});assert.deepEqual(pm.export(),before);assert.ok(c.characters<=120);pm.confirmContext(c,{turnId:'t'+i});break;}
   case 5:pm.recordEvent({chatId,userId,type:'verified-game-event',changes:{trust:random(11)-5},eventId:'h'+i});break;
  }
  const state=pm.export(),stats=pm.diagnostics();
  assert.ok(stats.profiles<=64 && stats.visitors<=32 && stats.dedupeEntries<=128 && stats.confirmedTurns<=128 && stats.historyEntries<=32);
  for(const people of Object.values(state.sessions))for(const p of Object.values(people))assert.ok(p.affinity.value>=0 && p.affinity.value<=100 && Number.isFinite(p.affinity.value));
  for(const tags of Object.values(state.tags))assert.ok(tags.length<=16);
  if(i%100===0){const restored=new PersonaMemory({clock:()=>now,config});restored.import(state);assert.deepEqual(restored.export(),state);}
 }
});
test('failed validation cannot consume a message or corrupt an existing snapshot',()=>{
 const pm=new PersonaMemory();const before=pm.export();
 assert.throws(()=>pm.ingest({chatId:'r',userId:'u',text:'hi',ts:Number.MAX_VALUE,eventId:'invalid'}),/calendar/);
 assert.deepEqual(pm.export(),before);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-capacity-'));
 try{
   const stored=new PersonaMemory({storage:dir,config:{maxSnapshotBytes:4096}});
   stored.ingest({chatId:'r',userId:'first',text:'hi',directedToBot:true});stored.flush();
   const file=path.join(dir,'default.json'),previous=fs.readFileSync(file,'utf8');
   for(let i=0;i<20;i++)stored.ingest({chatId:'r',userId:'extra-'+i,text:'hello',directedToBot:true});
   assert.throws(()=>stored.flush(),e=>e.code==='ERR_MEMORY_CAPACITY');
   assert.equal(fs.readFileSync(file,'utf8'),previous);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("oversized imported tag collections fail atomically",()=>{
 const pm=new PersonaMemory(),before=pm.export(),bad=pm.export();
 bad.tags.u=Array.from({length:4097},()=>({tag:"x",addedAt:1,lastHitAt:1,expiresAt:2,longTerm:false,hits:1,injections:0}));
 assert.throws(()=>pm.import(bad),/excessive tag list/);assert.deepEqual(pm.export(),before);
});
