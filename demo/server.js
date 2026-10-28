// persona-memory · 可运行 demo
//
//   node demo/server.js
//   打开 http://127.0.0.1:7788
//
// 零依赖，不需要 API key。模型回复是按好感度档位写死的规则，
// 目的是让你直接看到"关系变了，语气也跟着变"。
//
// 接真实 LLM 的方式见 README：把 buildReply() 换成你的模型调用即可。

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PersonaMemory } from '../src/index.js';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 7788;

const pm = new PersonaMemory({
  storage: path.join(ROOT, '.data'), // 落盘到 demo/.data，下次启动还在
  persona: 'demo',
});

const CHAT_ID = 'demo-room';

/**
 * 假 LLM：按档位换语气。真接入时换成你的模型调用。
 * 返回值里同时带上"这句话是被什么关系状态决定的"。
 */
function buildReply(tier, profile) {
  const name = '你';
  const catchword = profile.style.catchphrases[0];
  switch (tier) {
    case '很铁':
      return `${name}来啦，老样子？${catchword ? `今天可别再"${catchword}"了哈哈哈` : ''}`;
    case '亲近':
      return `${name}来啦～今天想聊点什么？`;
    case '熟了':
      return `又见面了，最近怎么样？`;
    case '眼熟':
      return `嗯，是你啊。有什么事吗？`;
    default:
      return `你好。`;
  }
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    // 静态页
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = readFileSync(path.join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // 当前状态
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const userId = url.searchParams.get('userId') || 'visitor';
      const profile = pm.getProfile(CHAT_ID, userId);
      const block = pm.buildBlock({ chatId: CHAT_ID, userIds: [userId], budget: 700 });
      return json(res, 200, { ok: true, profile, block });
    }

    // 发一条消息
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readBody(req);
      const userId = String(body.userId || 'visitor');
      const text = String(body.text || '').trim();
      if (!text) return json(res, 400, { ok: false, error: 'text required' });

      // 1. 记录用户消息（@ bot 才涨分，这里 demo 里每条都算在跟她聊）
      const before = pm.getProfile(CHAT_ID, userId);
      const r = pm.ingest({
        chatId: CHAT_ID,
        userId,
        text,
        ts: Date.now(),
        mentionsSelf: true,
      });

      // 2. 取关系段落（真实场景里这段会拼进 system prompt）
      const block = pm.buildBlock({ chatId: CHAT_ID, userIds: [userId], budget: 700 });

      // 3. 按当前档位生成回复
      const after = pm.getProfile(CHAT_ID, userId);
      const reply = buildReply(after.affinity.tier, after);

      // 4. 记录 bot 的回复
      pm.ingest({ chatId: CHAT_ID, userId, text: reply, ts: Date.now() + 1, isSelf: true });
      pm.flush();

      return json(res, 200, {
        ok: true,
        reply,
        delta: r.delta,
        profile: after,
        block,
        tierChanged: before?.affinity.tier !== after.affinity.tier,
        tierBefore: before?.affinity.tier ?? null,
      });
    }

    // 手动维护（演示衰减）
    if (req.method === 'POST' && url.pathname === '/api/maintain') {
      const body = await readBody(req);
      const r = pm.maintain(Date.now() + (Number(body.days) || 1) * 86400000);
      return json(res, 200, { ok: true, ...r });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  persona-memory demo`);
  console.log(`  → http://127.0.0.1:${PORT}\n`);
  console.log(`  数据落盘: ${path.join(ROOT, '.data')}`);
  console.log(`  想看衰减效果：点页面上的「跳过 1 天」按钮\n`);
});

// 后台维护
setInterval(() => {
  try {
    pm.maintain();
  } catch {}
}, 10 * 60 * 1000);
