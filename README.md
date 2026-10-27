# persona-memory

[![npm version](https://img.shields.io/npm/v/persona-memory.svg)](https://www.npmjs.com/package/persona-memory)
[![npm downloads](https://img.shields.io/npm/dm/persona-memory.svg)](https://www.npmjs.com/package/persona-memory)
[![license](https://img.shields.io/npm/l/persona-memory.svg)](LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

> 给对话 agent 的**社交状态层**：谁跟你熟、他最近什么状态、该用什么语气。

不是"记住用户说过什么"，是"记住你和这个人处到哪一步了"。

---

## 为什么又造一个记忆轮子

现有的记忆方案解决的是**事实存储**：

| 项目 | 记什么 | 机制 |
|---|---|---|
| mem0 | "用户叫张三，住在上海" | LLM 抽取 + 向量 |
| Letta / MemGPT | 分层上下文 | agent 自管理 |
| Zep | 事实随时间演化 | 时序知识图谱 |
| **persona-memory** | **"和小明到 62 分，最近在找工作"** | **规则 + 衰减 + 生命周期** |

前者回答「**他是什么人**」，这里回答「**我们是什么关系**」。

这两件事不一样。一个记事实的库，永远不会告诉你：

- 这个人今天该用客气语气还是可以互怼
- "最近很累"这个状态已经过了 48 小时，该过期了
- 一个月没说话，关系该淡一点
- 群里 30 个人，这次只该把 3 个人的信息放进提示词

---

## 四个核心机制

### 1. 好感度：有上限、会衰减、分档位

```
5 档：生疏(0) / 眼熟(20) / 熟了(40) / 亲近(60) / 很铁(80)

@ 你       +2
引用 / 回复 +2
夸你       +3
骂你       -5      ← 负分不封顶
拍一拍     +1.5
普通说话   +1      ← 每天只计 12 句
每日涨幅上限 30 分   ← 防话痨一轮刷满
每天回落 2 分        ← 久了不来往会淡
```

关键设计：**分数不是终身积分，是近期状态**。涨有日额度，跌没下限，久了自动回落。

### 2. 状态标签：短期会过期，反复出现才晋升

```
命中 → 短期标签，48 小时过期；再次命中是"顺延"不是"重来"
晋升长期：注入过 ≥6 轮 + 存活 ≥3 天 + 命中 ≥2 次
每人上限 16 个，超了丢最旧的短期
```

"这人最近在找工作"是**会过期的信息**，不该一直挂在上面。但"他爱说'确实'"这种习惯，聊久了就该沉淀成长期印象。

### 3. 说话风格：从消息里统计，不靠模型

长度、问句率、表情率、夜间活跃率、口头禅滑窗。

纯本地规则，**零 token 成本**——不要为了知道对方爱用表情，去调一次模型。

### 4. 提示词预算：只注入该注入的

```
最多注入 4 个人 / 700 字，按好感度和活跃度排序，超了截断
```

同时面对几十个人时，这是必需品。不做预算控制，提示词会被关系信息撑爆。

---

## 安装

```bash
npm install persona-memory
```

零运行时依赖，纯 JS，Node 18+。

## 快速开始

```js
import { PersonaMemory } from 'persona-memory';

const pm = new PersonaMemory({
  storage: './data',        // 档案落盘目录
  persona: 'assistant',     // 人设键：换人设换一套档案
});

// 1. 收到消息 → 喂进去（同步、无 IO 阻塞）
pm.ingest({
  chatId: 'group-1001',
  userId: 'u-42',
  text: '今天好累啊',
  ts: Date.now(),
  mentions: ['assistant'],
});

// 2. 组装提示词 → 拿到该注入的【关系记忆】段落
const block = pm.buildBlock({
  chatId: 'group-1001',
  userIds: ['u-42'],
  budget: 700,              // 字数上限
});

// block 长这样：
// 【交往记忆】
// - 小明：熟了（52 分），话不多，爱用"确实"，最近状态：累（2 天前）

// 3. 把 block 拼进你的 system prompt 或第一条消息

// 4. 定时维护（衰减、标签过期、长期标签晋升）
setInterval(() => pm.maintain(), 10 * 60 * 1000);
```

---

## 三种接入方式

| 方式 | 适合 | 能力 |
|---|---|---|
| **Node 库** | 自己写 agent 循环 | 100% |
| **HTTP API** | 任何语言的后端 | 90% |
| **MCP Server** | Claude Desktop / Cursor | ~30% ⚠️ |

**关于 MCP 的实话**：MCP 是「模型主动调用」，而这个库的核心价值是「框架自动注入」——在模型看到消息**之前**就把关系信息拼好。MCP 版本只能做到「模型想起来时查一下」，体验差一截。详见 [docs/API.md](docs/API.md)。

---


## 先例（诚实说明）

好感度系统不新，这几个项目做得比我深或更早：

| 项目 | 是什么 | 和这里的区别 |
|---|---|---|
| [etherfunlab/eros-engine](https://github.com/etherfunlab/eros-engine) | **六轴**好感度向量 + decay + tier drop | 更精细，但依赖 LLM judge、是完整引擎不是库 |
| [koishi-plugin-chatluna-affinity](https://www.npmjs.com/package/koishi-plugin-chatluna-affinity) | Koishi 的好感度/关系/黑名单 | 绑 Koishi + onebot，无标签生命周期、无预算 |
| [suis077/dsh-companion](https://github.com/suis077/dsh-companion) | DSH 人设卡 + 跨会话记忆 + 好感度 | 绑 DSH，好感度单一值，不支持多人 |

**这里不试图做得更深，只想做得更轻**：库而不是引擎、零 LLM 调用、标签会过期、
提示词有硬预算。这几件事的组合我没找到现成的。

## 和同类方案的区别

| | persona-memory | mem0 | Letta |
|---|---|---|---|
| 记关系状态 | ✅ | ❌ | ⚠️ 靠模型自己判断 |
| 好感度衰减 | ✅ | ❌ | ❌ |
| 标签生命周期 | ✅ | ❌ | ❌ |
| 零 LLM 成本 | ✅ | ❌（抽取要调模型） | ❌ |
| 提示词预算控制 | ✅ | ❌ | ⚠️ |
| 事实检索 | ❌ | ✅ | ✅ |

**不是替代关系。** 想要事实记忆用 mem0，想要关系状态用这个。两个可以并存——把 persona-memory 的 block 和 mem0 的 facts 拼进同一个提示词。

---

## 场景

- **社群 bot**：Discord / Telegram / 企业微信群里记住每个成员
- **AI 陪伴**：好感度不该是「聊得多就高」，该是会淡的
- **客服 agent**：客户状态标签（比价中 / 情绪不好 / 上次没解决）48 小时自动过期
- **游戏 NPC**：NPC 记得玩家，关系随互动变化


## 关键词 / Keywords

**英文**：agent memory · persona memory · relationship memory · affinity system ·
AI companion memory · chatbot user profile · NPC relationship · social simulation ·
LLM long-term memory · decaying affinity · tag lifecycle · prompt budget

**中文**：AI 记忆 · agent 记忆 · 好感度系统 · 关系记忆 · 用户画像 ·
陪伴 AI 记忆 · NPC 记忆 · 群聊机器人记忆 · 长期记忆 · 状态标签

## License

MIT
