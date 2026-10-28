import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory} from '../src/index.js';
import {summarizeShadow} from '../tools/shadow.mjs';
test('optional tokenizer enforces token and character budgets together',()=>{
 const pm=new PersonaMemory();pm.ingest({chatId:'r',userId:'u',text:'好累',mentionsSelf:true});
 const options={chatId:'r',userIds:['u'],countTokens:s=>Array.from(s).length};
 const tiny=pm.buildContext({...options,tokenBudget:3});
 assert.equal(tiny.text,'');assert.equal(tiny.tokens,0);
 const big=pm.buildContext({...options,tokenBudget:100});
 assert.ok(big.tokens<=100);assert.match(big.text,/最近很累/);
});
test('clearing one scope cannot clear another, including filename delimiter collisions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-scope-'));
 try{
  const a=new PersonaMemory({storage:dir,scope:'a--b',persona:'c'});
  const b=new PersonaMemory({storage:dir,scope:'a',persona:'b--c'});
  for(const pm of [a,b]){pm.ingest({chatId:'r',userId:'u',text:'你好',mentionsSelf:true});pm.flush();}
  assert.equal(fs.readdirSync(dir).length,2);
  a.clear();a.flush();assert.equal(new PersonaMemory({storage:dir,scope:'a',persona:'b--c'}).diagnostics().profiles,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a synthetic shadow exports aggregates without texts or identifiers',()=>{
 const r=summarizeShadow([{chatId:'private-room-999',userId:'real-person-123',text:'今天好累啊',ts:1000,eventId:'1',mentionsSelf:true}]);
 const output=JSON.stringify(r);
 assert.equal(r.messages,1);assert.equal(r.modelUsageConfirmed,0);
 for(const text of ['private-room-999','real-person-123','今天好累啊'])assert.ok(!output.includes(text));
});
test('ambient praise does not affect relationship without an explicit interaction',()=>{
 const pm=new PersonaMemory();pm.ingest({chatId:'r',userId:'u',text:'这个软件好厉害'});
 assert.equal(pm.getProfile('r','u'),null);
});
