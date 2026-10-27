// HTTP 适配器：让非 Node 宿主也能用（Python / Go / Java / PHP…）
//
// 启动：
//   PM_STORAGE=./data PM_PERSONA=assistant PM_TOKEN=xxx node adapters/http/server.js
//
// 接口：
//   POST /api/ingest    { chatId, userId, text, ts?, mentions?, replyTo?, isSelf? }
//   POST /api/context   { chatId, userIds[], budget?, maxPeople? }
//   GET  /api/profile   ?chatId=&userId=
//   POST /api/maintain
//   GET  /api/health

import http from 'node:http';
import { PersonaMemory } from '../../src/index.js';
import { parse } from '../generic/index.js';

const PORT = Number(process.env.PM_PORT) || 8791;
const TOKEN = process.env.PM_TOKEN || '';

const pm = new PersonaMemory({
  storage: process.env.PM_STORAGE || null,
  persona: process.env.PM_PERSONA || 'assistant',
});

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function auth(req, res) {
  if (!TOKEN) return true;
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (got === TOKEN) return true;
  json(res, 401, { ok: false, error: 'unauthorized' });
  return false;
}

async function readBody(req, limit = 1 << 20) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    if (!auth(req, res)) return;
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, version: '0.1.0' });
    }

    if (req.method === 'POST' && url.pathname === '/api/ingest') {
      const body = await readBody(req);
      const msg = parse(body);
      if (!msg) return json(res, 400, { ok: false, error: 'chatId/userId required' });
      const r = pm.ingest(msg);
      return json(res, 200, { ok: true, ...r });
    }

    if (req.method === 'POST' && url.pathname === '/api/context') {
      const body = await readBody(req);
      const block = pm.buildBlock({
        chatId: body.chatId,
        userIds: Array.isArray(body.userIds) ? body.userIds.map(String) : [],
        budget: body.budget,
        maxPeople: body.maxPeople,
      });
      return json(res, 200, { ok: true, block });
    }

    if (req.method === 'GET' && url.pathname === '/api/profile') {
      const chatId = url.searchParams.get('chatId');
      const userId = url.searchParams.get('userId');
      if (!chatId || !userId) return json(res, 400, { ok: false, error: 'chatId/userId required' });
      return json(res, 200, { ok: true, profile: pm.getProfile(chatId, userId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/maintain') {
      const r = pm.maintain();
      return json(res, 200, { ok: true, ...r });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[persona-memory] http listening on http://127.0.0.1:${PORT}`);
  if (TOKEN) console.log('[persona-memory] bearer auth enabled');
});

// 定时维护：衰减 / 标签过期 / 长期晋升
setInterval(() => {
  try {
    pm.maintain();
  } catch (e) {
    console.error('[persona-memory] maintain failed:', e.message);
  }
}, 10 * 60 * 1000);
