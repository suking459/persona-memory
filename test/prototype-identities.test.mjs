import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
const ids=['toString','valueOf','hasOwnProperty','__defineGetter__'];
test('valid IDs matching inherited object members support ingest, tags and context acknowledgement',()=>{
  for(const id of ids){
    const pm=new PersonaMemory({clock:()=>1000});
    assert.doesNotThrow(()=>pm.ingest({chatId:'room',userId:id,text:'好累',directedToBot:true,eventId:'first'}));
    assert.equal(pm.getProfile('room',id).tags.length,1);
    const context=pm.buildContext({chatId:'room',userIds:[id],budget:3000});assert.equal(context.people[0].userId,id);
    assert.equal(pm.confirmContext(context,{turnId:'used'}).tagCount,1);
    const copy=new PersonaMemory({clock:()=>1000});copy.import(pm.export());assert.deepEqual(copy.export(),pm.export());
  }
});
test('visitor dictionaries never read or mutate an inherited function for a valid ID',t=>{
  const originals=ids.map(id=>[Object.prototype[id],Object.getOwnPropertyDescriptors(Object.prototype[id])]);
  t.after(()=>{for(const [fn,descriptors] of originals){for(const key of Reflect.ownKeys(fn))if(!Object.hasOwn(descriptors,key))delete fn[key];Object.defineProperties(fn,descriptors);}});
  for(const id of ids){
    const pm=new PersonaMemory({clock:()=>1000});
    assert.equal(pm.getVisitor(id),null);
    pm.ingest({chatId:'room',userId:id,text:'普通观察',eventId:'ambient'});
    assert.equal(pm.getVisitor(id).count,1);assert.equal(Object.hasOwn(Object.prototype[id],'firstSeen'),false);
    pm.maintain();assert.equal(pm.getVisitor(id).count,1);
  }
});
test('manual tag access and empty visitor context stay safe across maintenance, clear and reload',()=>{
  for(const id of ids){
    const pm=new PersonaMemory({clock:()=>1000});
    assert.equal(pm.removeTag({chatId:'room',userId:id,tag:'missing'}),false);
    assert.doesNotThrow(()=>pm.setTag({chatId:'room',userId:id,tag:'checked',source:'host'}));
    pm.maintain();assert.equal(pm.getProfile('room',id).tags.length,1);
    pm.clear();assert.equal(pm.getVisitor(id),null);assert.equal(pm.buildContext({chatId:'room',userIds:[id]}).people.length,0);
    const copy=new PersonaMemory({clock:()=>1000});copy.import(pm.export());assert.equal(copy.getVisitor(id),null);
  }
});

test('enabled custom dimensions matching inherited names migrate absent values to the configured baseline',()=>{
  const config={dimensions:Object.fromEntries(ids.map(id=>[id,{min:0,max:100,baseline:50}]))};
  const pm=new PersonaMemory({config,clock:()=>1000});pm.ingest({chatId:'room',userId:'u',text:'hello',directedToBot:true});
  const snapshot=pm.export();snapshot.sessions.room.u.dimensions={};
  const copy=new PersonaMemory({config,clock:()=>1000});copy.import(snapshot);
  for(const id of ids)assert.equal(copy.getProfile('room','u').dimensions[id].value,50);
});
