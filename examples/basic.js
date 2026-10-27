// 最小可运行示例：看一次好感度和标签怎么变
//
//   node examples/basic.js

import { PersonaMemory } from '../src/index.js';

const pm = new PersonaMemory({ storage: null, persona: 'demo' });

const now = Date.now();
const chatId = 'group-1001';

// 模拟一段群聊：u1 跟 bot 熟，u2 只是路过，u3 骂了人
const script = [
  { userId: 'u1', text: '在吗', mentionsSelf: true },
  { userId: 'u1', text: '你今天好可爱啊', mentionsSelf: true },
  { userId: 'u1', text: '确实确实，我也这么觉得' },
  { userId: 'u1', text: '拍拍' },
  { userId: 'u2', text: '路过看看' },
  { userId: 'u3', text: '傻逼机器人', mentionsSelf: true },
  { userId: 'u2', text: '今天好累啊' },
];

script.forEach((m, i) => {
  const r = pm.ingest({ chatId, userId: m.userId, text: m.text, ts: now + i * 1000, mentionsSelf: m.mentionsSelf });
  console.log(
    `[${String(i + 1).padStart(2)}] ${m.userId}  "${m.text}"  →  ${r.matched ? `${r.delta > 0 ? '+' : ''}${r.delta}` : '不计分'}`
  );
});

console.log('\n──────── 档案 ────────');
for (const id of ['u1', 'u2', 'u3']) {
  const p = pm.getProfile(chatId, id);
  if (!p) continue;
  console.log(
    `${id}: ${p.affinity.tier} (${p.affinity.value} 分)  风格: ${p.style.avgChars} 字/句, 问句 ${p.style.questionRate}%`
  );
}

console.log('\n──────── 注入给模型的段落 ────────');
const block = pm.buildBlock({ chatId, userIds: ['u1', 'u2', 'u3'], budget: 700 });
console.log(block || '(空)');

console.log('\n──────── 一天后：衰减 ────────');
const r = pm.maintain(now + 86400000);
console.log('衰减:', r.decayed, '人');
console.log('u1 现在:', pm.getProfile(chatId, 'u1').affinity.value, '分');
