# API 设计（三个适配层）

> 核心逻辑只写一次，适配器各写一遍。
> 三层共用同一套语义：**ingest → buildBlock → maintain**。

---

## 通用类型

```ts
/** 一条消息。宿主负责把它填好。 */
interface ChatMessage {
  /** 会话作用域：群号 / 频道 ID / 项目 ID，随便什么字符串 */
  chatId: string;
  /** 发送者 ID：QQ 号 / Discord user id / 客户 id */
  userId: string;
  /** 纯文本（已去掉 @ 标记等，原始形态放 raw） */
  text: string;
  /** 毫秒时间戳 */
  ts: number;
  /** 本条消息 @ 了谁（包括 bot 自己） */
  mentions?: string[];
  /** 回复的是哪条消息的 id */
  replyTo?: string;
  /** bot 自己发的消息（用于区分"谁搭理谁"） */
  isSelf?: boolean;
  /** 平台原始消息，适配器自用，不参与计算 */
  raw?: unknown;
}

interface Affinity {
  /** 0-100 */
  value: number;
  /** 基线，长时间不来往会回落到这里 */
  baseline: number;
  /** '生疏' | '眼熟' | '熟了' | '亲近' | '很铁' */
  tier: string;
  /** 给提示词用的一句话（"你们算熟了：正常唠嗑，不用客套"） */
  hint: string;
  lastInteractiveAt: number;
}

interface Tag {
  tag: string;
  /** 'builtin' | 'extra' | 'model' | 'manual' */
  source: string;
  /** 给提示词的行动建议 */
  advice?: string;
  /** null = 长期标签 */
  expiresAt: number | null;
  longTerm: boolean;
  hits: number;
  addedAt: number;
}

interface StyleProfile {
  /** 样本数 */
  count: number;
  avgChars: number;
  questionRate: number;   // 0-100
  emojiRate: number;      // 0-100
  nightRate: number;      // 0-100
  /** 常说的口头禅，已过滤屏蔽词 */
  catchphrases: string[];
}

interface Profile {
  chatId: string;
  userId: string;
  displayName?: string;
  affinity: Affinity;
  style: StyleProfile;
  tags: Tag[];
  lastAt: number;
}
```

---

## 一、Node 库（推荐）

```ts
import { PersonaMemory } from 'persona-memory';

const pm = new PersonaMemory({
  storage: './data',          // 落盘目录，null = 纯内存
  persona: 'assistant',       // 人设键，换人设换一套档案
  config?: Partial<Config>;   // 见下方 Config
});

/** 喂一条消息。同步，只写内存；落盘由 flush() 或 maintain() 批量做。 */
pm.ingest(msg: ChatMessage): {
  matched: boolean;           // 这条是否算"对她说的"
  delta?: number;             // 好感度变化
  newTags?: string[];
};

/** 取一段可直接拼进提示词的文本。返回空字符串 = 无需注入。 */
pm.buildBlock(opts: {
  chatId: string;
  userIds: string[];          // 本次涉及的人
  budget?: number;            // 字数上限，默认 700
  maxPeople?: number;         // 最多几人，默认 4
}): string;

/** 单人档案（给调试面板/管理后台用） */
pm.getProfile(chatId: string, userId: string): Profile | null;

/** 手动维护：衰减、标签过期、长期晋升。建议 10 分钟一次 */
pm.maintain(now?: number): {
  decayed: number;            // 回落了几个人
  expired: number;            // 过期了几个标签
  promoted: number;           // 晋升了几个长期标签
};

/** 立即落盘 */
pm.flush(): void;

/** 导出/导入（跨设备迁移） */
pm.export(): Snapshot;
pm.import(snapshot: Snapshot): void;

interface Config {
  /** 每天涨分上限 */
  dailyGainCap: number;       // 默认 30
  /** 每天回落 */
  decayPerDay: number;        // 默认 2
  /** 单条消息涨跌封顶 */
  perMessageCap: number;      // 默认 8
  /** 标签存活小时 */
  tagTtlHours: number;        // 默认 48
  /** 每人标签上限 */
  maxTagsPerPerson: number;   // 默认 16
  /** 关注窗口：被 @ 后多少秒内算"仍在聊" */
  attentionWindowSec: number; // 默认 180
  /** 自定义标签词表 */
  extraRules: Record<string, { words: string[]; advice: string }>;
  /** 口头禅屏蔽词 */
  blockWords: string[];
}
```

---

## 二、HTTP API

> 适合：Python / Go / Java 后端，或者把记忆层做成独立服务。

所有接口 `Content-Type: application/json`，成功 `{ ok: true, ... }`，失败 `{ ok: false, error }`。

```http
POST /api/ingest
Body: ChatMessage
Resp: { ok: true, matched: boolean, delta?: number }

POST /api/context
Body: { chatId, userIds: string[], budget?: number, maxPeople?: number }
Resp: { ok: true, block: string }
      // block 为空字符串 = 无内容可注入

GET /api/profile?chatId=g1&userId=u42
Resp: { ok: true, profile: Profile }

POST /api/maintain
Body: {}
Resp: { ok: true, decayed, expired, promoted }

GET /api/stats?chatId=g1
Resp: { ok: true, stats: { people, profiles, tagged, avgAffinity } }

GET /api/health
Resp: { ok: true, version: "0.1.0" }
```

**鉴权**：`Authorization: Bearer <token>`，token 走环境变量 `PM_TOKEN`，未设则不校验（仅本地）。

**并发**：单进程内存 + 落盘，写入用串行队列；多实例部署需要外部锁（不在 v1 范围）。

---

## 三、MCP Server

> 适合：Claude Desktop / Cursor / VS Code 这类只能通过 MCP 扩展的宿主。

```jsonc
// mcp.json
{
  "mcpServers": {
    "persona-memory": {
      "command": "npx",
      "args": ["-y", "persona-memory-mcp"],
      "env": {
        "PM_STORAGE": "D:/data/persona-memory",
        "PM_PERSONA": "assistant"
      }
    }
  }
}
```

暴露的工具：

| 工具 | 参数 | 返回 | 用途 |
|---|---|---|---|
| `memory_context` | `chatId`, `userIds[]`, `budget?` | `{ block }` | 取【关系记忆】段落 |
| `memory_profile` | `chatId`, `userId` | `Profile` | 查单人档案 |
| `memory_record` | `chatId`, `userId`, `text`, `mentions?` | `{ matched, delta }` | 记录一条消息 |

**⚠️ 必须知道的限制**：

MCP 是「模型主动调用」模型。这带来两个问题：

1. **记录不可靠**：模型不一定每次都调 `memory_record`，漏一条就少一条
2. **注入不自动**：`memory_context` 要模型自己想起来调，而不是每次对话自动带上

所以 MCP 版适合「**模型想深入了解一下某人时主动查**」，不适合「**每句话都带着关系**」。

如果宿主支持 hooks（如某些框架的 `beforeLLM` 回调），优先走库或 HTTP，不要走 MCP。

---

## 适配器开发指南

把一个新的聊天平台接进来，只需要实现一个 `Adapter`：

```ts
interface Adapter {
  /** 平台消息 → ChatMessage */
  parse(raw: unknown): ChatMessage | null;

  /** ChatMessage → 该平台的消息（可选，本库不发消息） */
  format?(msg: unknown): unknown;

  /** 取显示名（可选，库不依赖它算分） */
  resolveName?(chatId: string, userId: string): string | undefined;
}
```

现成的适配器：

```
adapters/
├── onebot/     # QQ（OneBot v11）
├── discord/    # Discord
├── telegram/   # Telegram
└── generic/    # 纯 JSON（自己写宿主用）
```

---

## 版本策略

- 核心语义（好感度/标签/风格）遵循 semver
- 适配器独立版本
- 存储格式带 `schemaVersion`，升级时自动迁移
