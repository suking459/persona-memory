// Minimal runnable example: observe relationship scores and tags.
//
//   node examples/basic.js

import { PersonaMemory } from '../src/index.js';

const pm = new PersonaMemory({ storage: null, persona: 'demo' });

const now = Date.now();
const chatId = 'group-1001';

// Synthetic group chat with direct interactions and passing messages.
const script = [
  { userId: 'u1', text: 'Are you there?', mentionsSelf: true },
  { userId: 'u1', text: 'You are helpful today.', mentionsSelf: true },
  { userId: 'u1', text: 'Indeed, I agree.' },
  { userId: 'u1', text: 'Thanks.' },
  { userId: 'u2', text: 'Just passing by.' },
  { userId: 'u3', text: 'This bot is annoying.', mentionsSelf: true },
  { userId: 'u2', text: 'I feel tired today.' },
];

script.forEach((m, i) => {
  const r = pm.ingest({ chatId, userId: m.userId, text: m.text, ts: now + i * 1000, mentionsSelf: m.mentionsSelf });
  console.log(
    `[${String(i + 1).padStart(2)}] ${m.userId}  "${m.text}"  →  ${r.matched ? `${r.delta > 0 ? '+' : ''}${r.delta}` : 'not scored'}`
  );
});

console.log('\n──────── Profiles ────────');
for (const id of ['u1', 'u2', 'u3']) {
  const p = pm.getProfile(chatId, id);
  if (!p) continue;
  console.log(
    `${id}: ${p.affinity.tier} (${p.affinity.value} points)  style: ${p.style.avgChars} chars/sentence, questions ${p.style.questionRate}%`
  );
}

console.log('\n──────── Reference context for the model ────────');
const block = pm.buildBlock({ chatId, userIds: ['u1', 'u2', 'u3'], budget: 700 });
console.log(block || '(empty)');

console.log('\n──────── Decay after one day ────────');
const r = pm.maintain(now + 86400000);
console.log('Decayed:', r.decayed, 'profiles');
console.log('u1 now:', pm.getProfile(chatId, 'u1').affinity.value, 'points');
