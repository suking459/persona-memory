import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,TIERS,TAG_RULES,matchTags,scoreMessage,normalizeTag,hitTag,sweepTags,updateStyle,summarizeStyle} from '../src/index.js';
import {parse} from '../adapters/generic/index.js';
const DAY=86400000;
test('default policy never assigns health/emotion tags or a personality hint',()=>{
  assert.equal(TAG_RULES.length,0);assert.ok(Object.isFrozen(TAG_RULES));assert.ok(TIERS.every(t=>t.hint===''));
  const pm=new PersonaMemory({clock:()=>0});
  for(const [index,text]of ['我好累','我发烧了','太开心了','I am exhausted','今日は疲れました'].entries()){
    assert.deepEqual(matchTags(text),[]);
    pm.ingest({chatId:'r',userId:String(index),text,directedToBot:true});
    const p=pm.getProfile('r',String(index));assert.deepEqual(p.tags,[]);assert.equal(p.affinity.hint,'');assert.equal(p.affinity.tier,'band-0');
  }
});
test('semantic words cannot change a structural score, while explicit host zero and negative values are honored',()=>{
  const words=['hello','我好累','傻逼','great work','🙂'];
  for(const text of words)assert.deepEqual(scoreMessage(text,{mentionsSelf:true}),{delta:2,reasons:['mention']});
  assert.equal(scoreMessage('hello',{mentionsSelf:true,affinityDelta:0}).delta,0);
  assert.equal(scoreMessage('hello',{affinityDelta:-100}).delta,-8);
  assert.equal(scoreMessage('hello',{affinityDelta:100}).delta,8);
  assert.deepEqual(scoreMessage('hello',{isSelf:true,affinityDelta:7}),{delta:0,reasons:[]});
});
test('host delta survives normalization, has independent total daily caps, and fails before dedupe on invalid input',()=>{
  const pm=new PersonaMemory({clock:()=>0,config:{dailyGainCap:5,talkDailyCap:0}});
  const input={chatId:'r',userId:'u',text:'synthetic',eventId:'one',affinityDelta:4};
  assert.equal(pm.ingest(parse(input)).delta,4);
  assert.equal(pm.ingest({...input,eventId:'two'}).delta,1);
  assert.equal(pm.ingest({...input,eventId:'negative',affinityDelta:-3}).delta,-3);
  assert.equal(pm.getProfile('r','u').affinity.value,2);
  const before=pm.export();
  for(const affinityDelta of [NaN,Infinity,'4']){
    assert.throws(()=>pm.ingest({...input,eventId:'bad',affinityDelta}),/affinityDelta/);assert.deepEqual(pm.export(),before);
    assert.throws(()=>parse({...input,affinityDelta}),/affinityDelta/);
  }
});
test('host zero creates no implied score and direct interaction still uses its dedicated quota',()=>{
  const pm=new PersonaMemory({clock:()=>0,config:{talkDailyCap:1}});
  assert.equal(pm.ingest({chatId:'r',userId:'u',text:'hi',directedToBot:true,affinityDelta:0}).delta,0);
  assert.equal(pm.ingest({chatId:'r',userId:'u',text:'hi',directedToBot:true}).delta,1);
  assert.equal(pm.ingest({chatId:'r',userId:'u',text:'hi',directedToBot:true}).delta,0);
});
test('custom rules remain literal, scoped data with host-written guidance',()=>{
  const rules={release:{words:['部署窗口'],advice:'Synthetic deployment guidance'}};
  assert.equal(matchTags('我确认部署窗口',rules)[0].source,'extra');
  assert.deepEqual(matchTags('朋友确认部署窗口',rules),[]);
  const pm=new PersonaMemory({clock:()=>0,config:{extraRules:rules}});
  pm.ingest({chatId:'r',userId:'u',text:'我确认部署窗口',directedToBot:true});
  assert.match(pm.buildBlock({chatId:'r',userIds:['u']}),/Synthetic deployment guidance/);
});
test('tag normalizer carries prior data and optional evidence without reconstructing policy text',()=>{
  const input={tag:' host-value ',source:'host',advice:'Owner-provided original text',addedAt:0,lastHitAt:DAY,
    hits:4,injections:2,longTerm:true,evidenceId:'source-1',promotedAt:DAY,revision:3};
  const frozen=structuredClone(input),t=normalizeTag(input,2*DAY);
  assert.equal(t.tag,'host-value');assert.equal(t.advice,input.advice);assert.equal(t.expiresAt,null);
  assert.equal(t.lastEvidenceAt,DAY);assert.equal(t.evidenceId,'source-1');assert.equal(t.revision,3);assert.deepEqual(input,frozen);
  assert.equal(normalizeTag(null,0),null);assert.equal(normalizeTag({tag:''},0),null);
});
test('counter saturation and history preservation cannot overflow a tag hit',()=>{
  const original=[{tag:'host',advice:'previous',source:'host',addedAt:0,lastHitAt:0,lastEvidenceAt:0,
    expiresAt:2*DAY,longTerm:false,hits:Number.MAX_SAFE_INTEGER,injections:0}];
  const next=hitTag(original,'host','updated',DAY);
  assert.equal(next[0].hits,Number.MAX_SAFE_INTEGER);assert.equal(next[0].lastEvidenceAt,DAY);
  assert.equal(original[0].advice,'previous');assert.equal(original[0].lastEvidenceAt,0);
});
test('expired short tags cannot be promoted and zero-TTL demotion does not revive them',()=>{
  const expired={tag:'old',addedAt:0,lastHitAt:4*DAY,lastEvidenceAt:4*DAY,longTerm:false,expiresAt:3*DAY,injections:6};
  assert.deepEqual(sweepTags([expired],4*DAY).tags,[]);
  const idle={...expired,tag:'idle',longTerm:true,expiresAt:null,lastEvidenceAt:0};
  const result=sweepTags([idle],8*DAY,{tagTtlHours:0});
  assert.equal(result.demoted,1);assert.equal(result.expired,1);assert.deepEqual(result.tags,[]);
});
test('capacity priority is stable and lifecycle never mutates the input',()=>{
  const records=Array.from({length:30},(_,index)=>({tag:String(index),addedAt:0,lastHitAt:index,lastEvidenceAt:index,
    longTerm:index===0,expiresAt:index===0?null:DAY,injections:0}));
  const before=structuredClone(records),out=sweepTags(records,100,{maxTagsPerPerson:3});
  assert.deepEqual(out.tags.map(t=>t.tag),['0','28','29']);assert.deepEqual(records,before);
});
test('old snapshots retain owner data across import without triggering new default extraction',()=>{
  const first=new PersonaMemory({clock:()=>DAY});
  first.setTag({chatId:'r',userId:'u',tag:'legacy data',advice:'Original owner data',source:'host'});
  const state=first.export(),second=new PersonaMemory({clock:()=>DAY});second.import(state);
  second.ingest({chatId:'r',userId:'u',text:'我发烧了',directedToBot:true});
  assert.deepEqual(second.getProfile('r','u').tags.map(t=>[t.tag,t.advice]),[['legacy data','Original owner data']]);
});
test('phrase observations count a word once per message and preserve Unicode text',()=>{
  let style;
  for(let i=0;i<3;i++)style=updateStyle(style,'alpha alpha alpha café café',0);
  assert.equal(style.catch.alpha,3);assert.equal(style.catch.café,3);
  assert.ok(summarizeStyle(style).catchphrases.includes('café'));
  const before=structuredClone(style);updateStyle(style,'beta beta',0);assert.deepEqual(style,before);
});
test('phrase candidates are bounded and blocking avoids gathering new candidates',()=>{
  const text=Array.from({length:300},(_,i)=>'word'+i).join(' ');
  const style=updateStyle(null,text,0);
  assert.ok(Object.keys(style.catch).length<=128);assert.equal(updateStyle(null,'alpha alpha',0,['alpha']).catch.alpha,undefined);
});
