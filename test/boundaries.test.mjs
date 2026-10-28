import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
import {parse} from '../adapters/generic/index.js';
const m={chatId:'r',userId:'u',text:'好累',mentionsSelf:true};
test('same-millisecond fresh evidence invalidates old tag usage references',()=>{
 const pm=new PersonaMemory({clock:()=>1000});pm.ingest({...m,eventId:'a'});
 const c=pm.buildContext({chatId:'r',userIds:['u']});
 pm.ingest({...m,eventId:'b'});
 assert.equal(pm.confirmContext(c,{turnId:'old-view'}).tagCount,0);
});
test('expired short tags are new observations instead of resurrected counters',()=>{
 let now=1000;const pm=new PersonaMemory({clock:()=>now});pm.ingest(m);
 const c=pm.buildContext({chatId:'r',userIds:['u']});pm.confirmContext(c,{turnId:'once'});
 now+=3*86400000;pm.ingest({...m,eventId:'after-expiry'});
 const tag=pm.getProfile('r','u').tags[0];
 assert.equal(tag.injections,0);assert.equal(tag.addedAt,now);assert.equal(tag.longTerm,false);
});
test('attention window supports epoch zero and zero disables follow-up scoring',()=>{
 let now=0;const pm=new PersonaMemory({clock:()=>now});pm.ingest({...m,text:'你好'});
 now=1;assert.ok(Math.abs(pm.ingest({...m,text:'继续聊',mentionsSelf:false}).delta-1)<1e-12);
 const off=new PersonaMemory({clock:()=>0,config:{attentionWindowSec:0}});
 off.ingest({...m,text:'你好'});
 assert.equal(off.ingest({...m,text:'继续聊',mentionsSelf:false}).delta,0);
});
test('long chat and user IDs round-trip in isolated channel snapshots',()=>{
 const options={config:{tagScope:'chat'}},a=new PersonaMemory(options);
 const chatId='c'.repeat(180),userId='u'.repeat(180);
 a.ingest({...m,chatId,userId});const b=new PersonaMemory(options);b.import(a.export());
 assert.equal(b.getProfile(chatId,userId).tags[0].tag,'最近很累');
});
test('invalid boolean inputs fail before recording a dedupe key',()=>{
 const pm=new PersonaMemory();assert.throws(()=>pm.ingest({...m,mentionsSelf:'false',eventId:'retry'}),/boolean/);
 assert.equal(pm.diagnostics().dedupeEntries,0);
 assert.throws(()=>parse({...m,mentionsSelf:'false'}),/boolean/);
 assert.equal(pm.ingest({...m,eventId:'retry'}).duplicate,undefined);
});
