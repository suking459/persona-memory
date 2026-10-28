import test from 'node:test';
import assert from 'node:assert/strict';
import { PersonaMemory, scoreMessage, tierOf, sweepTags, summarizeStyle, updateStyle, matchTags } from '../src/index.js';

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

test('score: isSelf returns object not number (regression)', () => {
  const r = scoreMessage('hi', { isSelf: true });
  assert.equal(typeof r, 'object');
  assert.equal(r.delta, 0);
  assert.deepEqual(r.reasons, []);
});

test('ingest: bot own message does not crash', () => {
  const pm = new PersonaMemory({ storage: null });
  const r = pm.ingest({ chatId: 'g', userId: 'bot', text: '我是回复', isSelf: true });
  assert.equal(r.matched, false);
});
test('catchphrase: punctuation fragments are ignored', () => {
  let s = null;
  const now = Date.now();
  for (let i = 0; i < 5; i++) s = updateStyle(s, '真的吗？？', now);
  const sum = summarizeStyle(s);
  assert.ok(!sum.catchphrases.includes('？？'), '不该把纯标点当口头禅');
});

// ─── v0.3.0 新机制 ─────────────────────────────────────────────

test('v3: 0-score chat does not create profile, only visitor', () => {
  const pm = new PersonaMemory({ storage: null });
  const now = Date.now();
  pm.ingest({ chatId: 'g', userId: 'u', text: '666', ts: now });
  assert.equal(pm.getProfile('g', 'u'), null);
  assert.equal(pm.getVisitor('u').count, 1);
  pm.ingest({ chatId: 'g', userId: 'u', text: '777', ts: now + 1 });
  assert.equal(pm.getVisitor('u').count, 2);
  assert.equal(pm.getProfile('g', 'u'), null);
});

test('v3: tag hit creates profile even without score', () => {
  const pm = new PersonaMemory({ storage: null });
  pm.ingest({ chatId: 'g', userId: 'u', text: '今天好累啊', ts: Date.now() });
  const p = pm.getProfile('g', 'u');
  assert.ok(p, 'should create profile');
  assert.ok(p.tags.some((t) => t.tag === '最近很累'));
});

test('v3: visitor hint appears in block', () => {
  const pm = new PersonaMemory({ storage: null });
  const now = Date.now();
  pm.ingest({ chatId: 'g', userId: 'v', text: '666', ts: now });
  pm.ingest({ chatId: 'g', userId: 'v', text: '777', ts: now + 1 });
  pm.ingest({ chatId: 'g', userId: 'u', text: '你好厉害', ts: now + 2, mentionsSelf: true });
  const b = pm.buildBlock({ chatId: 'g', userIds: ['u', 'v'] });
  assert.ok(b.includes('来过 2 次'), b);
});

test('v3: visitorHint=false suppresses hint', () => {
  const pm = new PersonaMemory({ storage: null, config: { visitorHint: false } });
  const now = Date.now();
  pm.ingest({ chatId: 'g', userId: 'v', text: '666', ts: now });
  pm.ingest({ chatId: 'g', userId: 'v', text: '777', ts: now + 1 });
  pm.ingest({ chatId: 'g', userId: 'u', text: '你好厉害', ts: now + 2, mentionsSelf: true });
  const b = pm.buildBlock({ chatId: 'g', userIds: ['u', 'v'] });
  assert.ok(!b.includes('来过'), b);
});

test('v3: tag promotes without repeated hits', () => {
  const now = Date.now();
  const D = 86400000, H = 3600000;
  const tags = [{ tag: '累', source: 'builtin', advice: '', addedAt: now - 4 * D, lastHitAt: now - 4 * D,
    expiresAt: now + H, longTerm: false, hits: 1, injections: 6 }];
  const r = sweepTags(tags, now, {});
  assert.equal(r.promoted, 1);
  assert.equal(r.tags[0].longTerm, true);
});

test('v3: long-term tag demotes after idle days', () => {
  const now = Date.now();
  const D = 86400000;
  const tags = [{ tag: '累', source: 'builtin', advice: '', addedAt: now - 30 * D, lastHitAt: now - 10 * D,
    lastEvidenceAt: now - 10 * D, expiresAt: null, longTerm: true, hits: 2, injections: 20 }];
  const r = sweepTags(tags, now, { longTermTtlDays: 7 });
  assert.equal(r.demoted, 1);
  assert.equal(r.tags[0].longTerm, false);
});

test('v3: long-term tag stays when evidence is fresh', () => {
  const now = Date.now();
  const D = 86400000;
  const tags = [{ tag: '累', source: 'builtin', advice: '', addedAt: now - 30 * D, lastHitAt: now - 2 * D,
    lastEvidenceAt: now - 2 * D, expiresAt: null, longTerm: true, hits: 2, injections: 20 }];
  const r = sweepTags(tags, now, { longTermTtlDays: 7 });
  assert.equal(r.demoted, 0);
  assert.equal(r.tags[0].longTerm, true);
});

test('v3: over-injected short tag is forced out', () => {
  const now = Date.now();
  const D = 86400000, H = 3600000;
  const tags = [{ tag: '旧', source: 'builtin', advice: '', addedAt: now - D, lastHitAt: now - D,
    lastEvidenceAt: now - D, expiresAt: now + H, longTerm: false, hits: 1, injections: 250 }];
  const r = sweepTags(tags, now, { maxInjections: 200 });
  assert.equal(r.tags.length, 0);
  assert.equal(r.forcedOut, 1);
});

test('v3: matchTags finds builtin tags', () => {
  assert.ok(matchTags('今天加班到十点').some((h) => h.tag === '最近很累'));
  assert.ok(matchTags('我升职了！').some((h) => h.tag === '有喜事'));
  assert.equal(matchTags('今天天气不错').length, 0);
});
