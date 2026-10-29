import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PersonaMemory,matchTags} from '../src/index.js';
import {findEvidence,TEXT_LIMITS} from '../src/text-policy.js';
const cases=JSON.parse(fs.readFileSync(new URL('../tools/fixtures/tag-cases.json',import.meta.url),'utf8'));
test('classified synthetic evidence cases preserve their complete expected tag sets',()=>{
  assert.ok(cases.every(c=>typeof c.category==='string' && c.category.length));
  for(const c of cases)assert.deepEqual(matchTags(c.text).map(t=>t.tag).sort(),[...c.expected].sort(),c.category+': '+c.text);
});
test('third-party observations do not enter the speaker profile',()=>{
  const pm=new PersonaMemory({clock:()=>Date.UTC(2026,9,29)});
  pm.ingest({chatId:'synthetic',userId:'speaker',text:'我朋友发烧了',directedToBot:true,eventId:'third-party'});
  assert.deepEqual(pm.getProfile('synthetic','speaker').tags,[]);
  pm.ingest({chatId:'synthetic',userId:'speaker',text:'朋友发烧，我今天好累',directedToBot:true,eventId:'mixed'});
  assert.deepEqual(pm.getProfile('synthetic','speaker').tags.map(t=>t.tag),['最近很累']);
});
test('a rejected occurrence does not hide a later direct self-report',()=>{
  assert.equal(findEvidence('没有生病，'.repeat(255)+'我生病了','生病'),true);
  assert.equal(findEvidence('没有生病，'.repeat(256),'生病'),false);
});
test('excessive rejected occurrences and empty keywords fail within fixed limits',()=>{
  assert.throws(()=>findEvidence('没有生病，'.repeat(TEXT_LIMITS.occurrencesPerWord+1),'生病'),/excessive repeated keyword/);
  assert.throws(()=>findEvidence('任何内容',''),/empty literal keyword/);
  assert.throws(()=>matchTags('a'.repeat(TEXT_LIMITS.messageChars+1)),/message too large/);
});
test('custom keywords remain literal and case-insensitive',()=>{
  assert.deepEqual(matchTags('我正在用C++',{工具:{words:['c++'],advice:''}}).map(t=>t.tag),['工具']);
});
