import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {createPreset} from '../src/presets.js';

test('host events respect profile capacity and failed events leave no dedupe or history',()=>{
  const pm=new PersonaMemory({clock:()=>1000,config:{
    maxProfiles:1,dimensions:{trust:{min:0,max:100,baseline:0}},
  }});
  pm.ingest({chatId:'room',userId:'a',text:'你好',directedToBot:true});
  const before=pm.export();
  assert.throws(()=>pm.recordEvent({chatId:'room',userId:'b',eventId:'retry',
    type:'verified',changes:{trust:5}}),{code:'ERR_MEMORY_CAPACITY'});
  assert.deepEqual(pm.export(),before);
  pm.recordEvent({chatId:'room',userId:'a',eventId:'existing',type:'verified',changes:{trust:5}});
  assert.equal(pm.getProfile('room','a').dimensions.trust.value,5);
  pm.deleteUser('a');
  pm.recordEvent({chatId:'room',userId:'b',eventId:'retry',type:'verified',changes:{trust:5}});
  assert.equal(pm.getProfile('room','b').dimensions.trust.value,5);
});

test('support context includes resolved guidance without social qualification',()=>{
  const pm=new PersonaMemory({clock:()=>1000,config:createPreset('support')});
  pm.setTag({chatId:'room',userId:'customer',tag:'已解决',source:'host',
    advice:'不要继续追问已解决问题'});
  const before=pm.export(),context=pm.buildContext({chatId:'room',userIds:['customer']});
  assert.match(context.text,/已解决/);
  assert.match(context.text,/不要继续追问已解决问题/);
  assert.doesNotMatch(context.text,/生疏|先观察|分）/);
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.confirmContext(context,{turnId:'resolved'}).tagCount,1);
});

test('current mood guidance overrides generic familiar teasing advice',()=>{
  const pm=new PersonaMemory({clock:()=>1000,config:{decayBaseline:80}});
  pm.ingest({chatId:'room',userId:'friend',text:'今天好烦',directedToBot:true});
  const context=pm.buildContext({chatId:'room',userIds:['friend']});
  const tag=context.people[0].tags.find(t=>t.tag==='心情不好');
  assert.ok(tag?.advice);
  assert.ok(context.text.includes(tag.advice));
  assert.doesNotMatch(context.text,/互怼|开玩笑就行/);
});

test('context budget includes each complete label and guidance before confirming use',()=>{
  const pm=new PersonaMemory({clock:()=>1000,config:createPreset('support')});
  pm.setTag({chatId:'room',userId:'u',tag:'需要特别处理',advice:'完整指引'.repeat(50)});
  const context=pm.buildContext({chatId:'room',userIds:['u'],budget:50});
  assert.ok(context.characters<=50);
  assert.doesNotMatch(context.text,/需要特别处理|完整指引/);
  assert.equal(context.people[0].tags.length,0);
  assert.ok(context.omitted.some(t=>t.tag==='需要特别处理'&&t.reason==='tag-budget'));
  assert.equal(pm.confirmContext(context,{turnId:'tiny'}).tagCount,0);
  const full=pm.buildContext({chatId:'room',userIds:['u'],budget:700});
  assert.ok(full.text.includes('完整指引'.repeat(50)));
});

test('invalid advice is rejected atomically for direct updates and snapshot imports',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),before=pm.export();
  assert.throws(()=>pm.setTag({chatId:'room',userId:'u',tag:'状态',eventId:'retry',
    advice:'x'.repeat(2001)}),/tag advice/);
  assert.deepEqual(pm.export(),before);
  pm.setTag({chatId:'room',userId:'u',tag:'状态',eventId:'retry',advice:'完整指引'});
  const valid=pm.export(),invalid=pm.export();
  invalid.tags.u[0].advice='x'.repeat(2001);
  assert.throws(()=>pm.import(invalid),/tag advice/);
  assert.deepEqual(pm.export(),valid);
});

test('support only records service status unless the host enables social rules',()=>{
  const pm=new PersonaMemory({clock:()=>1000,config:createPreset('support')});
  pm.ingest({chatId:'room',userId:'u',text:'今天升职了，好累，订单问题处理得怎么样了',directedToBot:true});
  const context=pm.buildContext({chatId:'room',userIds:['u']});
  assert.deepEqual(pm.getProfile('room','u').tags,[]);
  assert.doesNotMatch(context.text,/起个哄|熬夜|生疏/);
  const custom=new PersonaMemory({config:createPreset('support',{extraRules:{
    心情不好:{words:['好烦'],advice:'确认诉求，给出下一步'},
  }})});
  custom.ingest({chatId:'room',userId:'u',text:'今天好烦',directedToBot:true});
  assert.match(custom.buildBlock({chatId:'room',userIds:['u']}),/确认诉求，给出下一步/);
});
