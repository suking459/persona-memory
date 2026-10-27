import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonaMemory, scoreMessage, tierOf, sweepTags, summarizeStyle, updateStyle } from '../src/index.js';

test('tier boundaries', () => {
  assert.equal(tierOf(0).tier, '生疏');
  assert.equal(tierOf(19).tier, '生疏');
  assert.equal(tierOf(20).tier, '眼熟');
  assert.equal(tierOf(45).tier, '熟了');
  assert.equal(tierOf(65).tier, '亲近');
  assert.equal(tierOf(100).tier, '很铁');
});

test('score: praise + mention caps at per-message limit', () => {
  const r = scoreMessage('你好厉害', { mentionsSelf: true });
  assert.equal(r.delta, 5); // 3 + 2
  const big = scoreMessage('好厉害真棒太强了喜欢你爱你', { mentionsSelf: true });
  assert.equal(big.delta, 5); // 夸词只计一次(3) + @(2)
});

test('score: insult goes negative', () => {
  const r = scoreMessage('傻逼', { mentionsSelf: true });
  assert.ok(r.delta < 0);
});

test('ingest then profile', () => {
  const pm = new PersonaMemory({ storage: null });
  const now = Date.now();
  pm.ingest({ chatId: 'g', userId: 'u', text: '你好呀', ts: now, mentionsSelf: true });
  const p = pm.getProfile('g', 'u');
  assert.ok(p.affinity.value > 0);
  assert.equal(p.style.count, 1);
});

test('buildBlock respects budget', () => {
  const pm = new PersonaMemory({ storage: null });
  pm.ingest({ chatId: 'g', userId: 'u', text: '你好呀', mentionsSelf: true });
  const b = pm.buildBlock({ chatId: 'g', userIds: ['u'], budget: 50 });
  assert.ok(b.length <= 50);
  assert.ok(b.includes('交往记忆'));
});

test('tag sweep: promote long term', () => {
  const now = Date.now();
  const tags = [{
    tag: '累', source: 'builtin', addedAt: now - 4 * 86400000, lastHitAt: now,
    expiresAt: now + 3600000, longTerm: false, hits: 2, injections: 6,
  }];
  const r = sweepTags(tags, now);
  assert.equal(r.promoted, 1);
  assert.equal(r.tags[0].longTerm, true);
});

test('tag sweep: expire old short tags', () => {
  const now = Date.now();
  const tags = [{
    tag: '旧', source: 'builtin', addedAt: now - 5 * 86400000, lastHitAt: now - 5 * 86400000,
    expiresAt: now - 3600000, longTerm: false, hits: 1, injections: 1,
  }];
  const r = sweepTags(tags, now);
  assert.equal(r.expired, 1);
  assert.equal(r.tags.length, 0);
});

test('style summary', () => {
  let s = null;
  const now = Date.now();
  for (let i = 0; i < 5; i++) s = updateStyle(s, '确实确实', now);
  const sum = summarizeStyle(s);
  assert.equal(sum.count, 5);
  assert.ok(sum.catchphrases.includes('确实'));
});
