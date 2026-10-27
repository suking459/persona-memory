// MCP server（stdio，JSON-RPC 2.0）
//
// ⚠️ 定位说明：
//   MCP 是「模型主动调用」模型，无法做到「每次对话自动注入关系记忆」。
//   这里的工具适合「模型想深入了解某人时主动查」，不适合替代库/HTTP 的自动注入。
//
// 配置示例（Claude Desktop）：
//   {
//     "mcpServers": {
//       "persona-memory": {
//         "command": "node",
//         "args": ["D:/path/to/persona-memory/adapters/mcp/server.js"],
//         "env": { "PM_STORAGE": "D:/data/pm", "PM_PERSONA": "assistant" }
//       }
//     }
//   }

import { PersonaMemory } from '../../src/index.js';

const pm = new PersonaMemory({
  storage: process.env.PM_STORAGE || null,
  persona: process.env.PM_PERSONA || 'assistant',
});

const TOOLS = [
  {
    name: 'memory_context',
    description: '取指定会话中若干用户的【交往记忆】段落，可直接拼进提示词。没人有档案时返回空字符串。',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: '会话 ID（群号/频道/项目）' },
        userIds: { type: 'array', items: { type: 'string' }, description: '涉及的用户 ID' },
        budget: { type: 'number', description: '字数上限，默认 700' },
        maxPeople: { type: 'number', description: '最多注入几人，默认 4' },
      },
      required: ['chatId', 'userIds'],
    },
  },
  {
    name: 'memory_profile',
    description: '查询单个人的档案：好感度、档位、说话风格、状态标签。',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['chatId', 'userId'],
    },
  },
  {
    name: 'memory_record',
    description: '记录一条消息，用于更新好感度、风格统计。注意：模型不一定每次都会调用，记录可靠性依赖调用方。',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        userId: { type: 'string' },
        text: { type: 'string' },
        ts: { type: 'number', description: '毫秒时间戳，默认当前' },
        mentionsSelf: { type: 'boolean', description: '是否 @ 了 bot' },
        replyToSelf: { type: 'boolean', description: '是否引用/回复了 bot' },
      },
      required: ['chatId', 'userId', 'text'],
    },
  },
];

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg || {};

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'persona-memory', version: '0.1.0' },
    });
  }

  if (method === 'notifications/initialized') return; // 无响应
  if (method === 'ping') return reply(id, {});

  if (method === 'tools/list') return reply(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const name = params?.name;
    const a = params?.arguments || {};

    if (name === 'memory_context') {
      const block = pm.buildBlock({
        chatId: a.chatId,
        userIds: Array.isArray(a.userIds) ? a.userIds : [],
        budget: a.budget,
        maxPeople: a.maxPeople,
      });
      return reply(id, { content: [{ type: 'text', text: block || '（没有可用的关系记忆）' }] });
    }

    if (name === 'memory_profile') {
      const p = pm.getProfile(a.chatId, a.userId);
      return reply(id, {
        content: [{ type: 'text', text: p ? JSON.stringify(p, null, 2) : '（没有这个人的档案）' }],
      });
    }

    if (name === 'memory_record') {
      const r = pm.ingest({
        chatId: a.chatId,
        userId: a.userId,
        text: a.text,
        ts: a.ts,
        mentionsSelf: a.mentionsSelf,
        replyToSelf: a.replyToSelf,
      });
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(r) }] });
    }

    return fail(id, -32602, `unknown tool: ${name}`);
  }

  return fail(id, -32601, `unknown method: ${method}`);
}

// stdio 逐行解析 JSON-RPC
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      await handle(JSON.parse(line));
    } catch (e) {
      fail(null, -32700, String(e?.message || e));
    }
  }
});
process.stdin.on('end', () => {
  pm.flush();
  process.exit(0);
});
