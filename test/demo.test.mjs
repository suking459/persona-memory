import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from '../demo/scenarios.js';
test('support demo corrects resolved status and preview leaves evidence untouched',()=>{
 const demo=createDemoState();demo.action('support','unresolved');
 assert.match(demo.chat('support','你好').reply,/没处理完/);
 demo.action('support','resolved');const s=demo.chat('support','你好');
 assert.match(s.reply,/已经解决/);assert.match(s.context.text,/不要继续追问已解决问题/);assert.doesNotMatch(s.context.text,/生疏|先观察/);assert.ok(!s.profile.tags.some(t=>t.tag==='待跟进'));
 assert.ok(s.profile.tags.every(t=>t.injections===0));
});
test('NPC demo separates host trust changes and chat familiarity',()=>{
 const demo=createDemoState();const first=demo.chat('npc','你好厉害');
 assert.equal(first.profile.dimensions.trust.value,50);
 assert.equal(demo.action('npc','promise-kept').profile.dimensions.trust.value,60);
 assert.equal(demo.action('npc','promise-broken').profile.dimensions.trust.value,50);
 assert.equal(demo.state('community').profile,null);
});
