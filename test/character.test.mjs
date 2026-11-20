import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MemorySnapshotStore,PersonaMemory,createCharacterTurnRouter,openCharacterProfile} from '../src/index.js';

const hour=3600000;
const observation=(id,sessionId,at,reaction='positive',topic='太空悬疑')=>({id,sessionId,at,reaction,topic,channel:'chat'});
const base=fileURLToPath(new URL('../.artifacts/',import.meta.url));
function directory(t){
  fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'character-'));
  t.after(()=>{
    assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  return dir;
}

test('the same events grow a preference across sessions but repeated exposure in one session does not',async()=>{
  let now=0;
  const shared=await openCharacterProfile({id:'shared',clock:()=>now});
  const distinct=await openCharacterProfile({id:'distinct',clock:()=>now});
  for(let i=1;i<=3;i++){
    now+=hour;
    await shared.record(observation('e'+i,'same',now));
    await distinct.record(observation('e'+i,'s'+i,now));
  }
  assert.deepEqual((await shared.inspect()).preferences,[]);
  const mature=await distinct.inspect();
  assert.equal(mature.mood,'pleased');
  assert.equal(mature.preferences[0].preference,'likes');
  now+=5*hour;
  assert.equal((await distinct.inspect()).mood,'neutral');
  assert.deepEqual((await distinct.inspect()).preferences,mature.preferences);
  for(let i=4;i<=8;i++){
    now+=hour;
    await distinct.record(observation('e'+i,'s'+i,now,'negative'));
  }
  assert.equal((await distinct.inspect()).preferences[0].preference,'dislikes');
});

test('character state is durable and supports correction, freeze, forgetting and reset',async t=>{
  let now=0;
  const dir=directory(t),file=path.join(dir,'character.json');
  const open=()=>openCharacterProfile({id:'fictional',file,clock:()=>now});
  let profile=await open();
  for(let i=1;i<=3;i++)await profile.record(observation('e'+i,'s'+i,++now));
  assert.equal((await profile.record(observation('e3','s3',now))).status,'duplicate');
  await profile.setFrozen(true);
  profile=await open();
  assert.equal((await profile.inspect()).preferences[0].topic,'太空悬疑');
  assert.equal((await profile.record(observation('e4','s4',++now))).status,'frozen');
  await profile.correct('e3',{reaction:'negative'});
  assert.deepEqual((await profile.inspect()).preferences,[]);
  await profile.forget('e3');
  assert.equal((await profile.record(observation('e3','s3',now))).status,'forgotten');
  await profile.reset();
  assert.deepEqual((await (await open()).inspect()).events,[]);
  assert.equal((await (await open()).inspect()).frozen,true);
  await assert.rejects(openCharacterProfile({id:'foreign',file,clock:()=>now}),/identity mismatch/);
});

test('opposing character profiles produce identical work payloads and keep chat inputs separate',async()=>{
  const pleasant=await openCharacterProfile({id:'pleasant',clock:()=>3000});
  const unpleasant=await openCharacterProfile({id:'unpleasant',clock:()=>3000});
  for(let i=1;i<=3;i++){
    await pleasant.record(observation('e'+i,'s'+i,i*1000));
    await unpleasant.record(observation('e'+i,'s'+i,i*1000,'negative'));
  }
  const make=profile=>createCharacterTurnRouter({profile,runWork:input=>({route:'work',input}),runChat:input=>({route:'chat',input})});
  const work={mode:'chat',hasTask:true,text:'First, implement pagination',workInput:{history:['approved work entry'],permissions:['read']}};
  const left=make(pleasant),right=make(unpleasant);
  assert.deepEqual(await left(work),await right(work));
  assert.deepEqual((await left(work)).input,{text:work.text,workInput:work.workInput});
  assert.equal((await right({mode:'chat',text:'Ambiguous routing'})).route,'work');
  const casual={mode:'chat',hasTask:false,text:'Pick a conversation topic',workInput:work.workInput};
  assert.deepEqual(Object.keys((await left(casual)).input),['text','character']);
  assert.equal((await left(casual)).input.character.preferences[0].preference,'likes');
  assert.equal((await right(casual)).input.character.preferences[0].preference,'dislikes');
  const unavailable=make({inspect(){throw new Error('failed character store');}});
  assert.equal((await unavailable(work)).route,'work');
  await assert.rejects(unavailable(casual),/failed character store/);
});

test('character storage refuses work snapshots and concurrent writers cannot silently lose evidence',async()=>{
  const work=new PersonaMemory(),workStore=new MemorySnapshotStore({snapshot:work.export()});
  const before=await workStore.read();
  await assert.rejects(openCharacterProfile({id:'unrelated',store:workStore}),/character snapshot|format/);
  assert.deepEqual(await workStore.read(),before);
  const backing=new MemorySnapshotStore();
  const profile=await openCharacterProfile({id:'shared',store:backing,clock:()=>42});
  const result=await Promise.allSettled([profile.record(observation('a','first',42)),profile.record(observation('b','second',42))]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.code,'ERR_STORE_CONFLICT');
  assert.equal((await profile.inspect()).events.length,1);
});
