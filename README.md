# persona-memory

当前本地 0.9 / 1.0 候选已采用 schema 5；候选审阅、经验和旧格式迁移见 [受控学习](docs/learning.md)。下文内部批次记录不代表已经发布。

可嵌入应用的记忆与关系状态组件：记录明确的用户/项目/任务记忆，并管理熟悉程度、临时状态和沟通风格。核心不调用模型，没有运行时依赖。

> GitHub 源码版本为 0.4.0。npm 现有 0.3.0 不包含这些新增接口，npm 发包另行处理。可克隆本仓库运行，或用 npm install github:suking459/persona-memory 安装源码。验证与限制见 [ROADMAP](docs/ROADMAP.md)。

设计来源是 [Kondius/qq-agent](https://github.com/Kondius/qq-agent) 的 memory-tree，重新实现为宿主独立的库。保留来源说明与版权声明，见 [NOTICE](NOTICE.md)。

## 开始使用

```js
import { PersonaMemory } from 'persona-memory';
import { createPreset } from 'persona-memory/presets';

const pm = new PersonaMemory({
  storage: './data',
  scope: 'my-app',             // 租户/应用边界；不同 scope 使用不同文件
  persona: 'assistant',        // 人设键，不是机器人的平台账号 ID
  config: createPreset('community', { botId: 'actual-bot-id' }),
});

pm.ingest({
  chatId: 'room-1', userId: 'u-1', eventId: 'message-1',
  text: '今天好累', mentionsSelf: true,
});

const context = pm.buildContext({ chatId: 'room-1', userIds: ['u-1'] });
// 将 context.text 作为关系资料送进应用实际使用的模型输入。
// 成功使用后确认一次；刷新面板或单纯查看不要确认。
pm.confirmContext(context, { turnId: 'turn-1' });
pm.flush();
// 宿主负责每隔一段时间调用 pm.maintain()。
```

未配置 storage 时纯内存运行。ingest 不做磁盘 IO；flush/maintain 会同步落盘。存储仅支持单进程写入。

## 本地 1.0 开发：通用记忆与检索

已实现的 0.6 内部批次增加 putMemory/getMemory/listMemories、明确主体与独立保存规则；偏好/事实/约束/决定不会沿用临时情绪的过期规则。记录不参与关系评分。

这些接口尚未推送或发布，GitHub 现有 0.4 和 npm 0.3 不包含它们。运行 npm run example:memory，详见 [通用记忆 API](docs/typed-memory.md)。0.7 已加入按问题检索、有预算的通用上下文、通用模型桥及 HTTP/MCP 接入，详见 [检索与调用说明](docs/retrieval.md)。存储互通与受控学习仍在后续批次。

## 主要能力

- **有边界的关系分数**：0–100；每日正向增长有额度，扣分没有单独的每日额度，单条仍有上限。
- **直接互动与旁观消息分开**：@、回复、私聊或宿主标记的直接互动可以计分；普通群消息不会因夸奖了别的事物而涨关系分。
- **可控生命周期**：短期状态过期，长期状态也会因缺乏新证据降级；来源不等于事实确认。
- **可纠正的状态**：宿主或人工可设置、替换、移除标签。
- **可选关系维度**：熟悉程度和信任分开；信任由宿主事件更新，不从奉承文字推断。
- **可解释的上下文**：返回选中项、来源和省略原因；预览不改变状态，实际使用按 turnId 去重。
- **数据管理**：scope 隔离、可选频道隔离、删除用户、清空当前实例、快照导入导出、版本迁移。
- **本地规则**：默认中文关键词和统计；有基础否定/引用过滤，不具备通用语义理解。

## 接入方式

| 方式 | 入口 | 定位 |
|---|---|---|
| Node | PersonaMemory | 宿主主动记录消息和注入上下文，推荐 |
| HTTP | persona-memory-http / npm run http | 非 Node 宿主调用；默认仅回环地址 |
| MCP | persona-memory-mcp / npm run mcp | 模型按需查询；不能保证每轮自动记录与注入 |
| Discord | adapters/discord + examples/discord-bot.js | 解析真实 SDK 消息；示例回复为规则输出 |
| LangChain | createLangChainBridge | 明确组合进 Runnable，避免虚假的自动 memory hook |
| LlamaIndex TS | createLlamaIndexBridge | 可选历史兼容桥接；当前 core 包已停止维护 |

集成依赖仅用于开发/示例，不进入核心 dependencies。已验证版本和未验证项目见 [接入说明](docs/integrations.md)。

## 看效果

```sh
npm run demo
# http://127.0.0.1:7788
```

包含社群、陪伴、客服、NPC 四个场景。可以推进一天、改变客服处理状态、通过宿主事件调整 NPC 信任，并查看上下文与来源。

这是不需要密钥的规则演示。它展示机制，不证明真实模型回复质量提高。

## 验证

```sh
npm test
npm run typecheck
npm run test:risk
npm run evaluate
```

开发验证使用锁定的可选框架依赖，建议 Node 20+；核心面向 Node 18+。评估使用公开的合成样例，性能数字仅代表当前机器基线。

## 资料

- [API 与数据语义](docs/API.md)
- [六个接入配方](docs/cookbook.md)
- [参数与场景预设](docs/tuning.md)
- [接入与兼容状态](docs/integrations.md)
- [0.3 数据迁移](docs/migration.md)
- [实测与影子观察](docs/evaluation.md)
- [路线与验收](docs/ROADMAP.md)

## 限制

关系分数与词表只是应用规则；不是对人的心理或可信程度评估。未获确认的观察需要保留来源，业务事实交给业务系统。

当前不提供向量检索、跨平台身份猜测、多进程文件协调或完整事件溯源。RAG 可以独立组合，暂不为缺乏验证的检索能力发布新包。

MIT。保留 LICENSE 中的版权声明。

设计取舍见 [DESIGN](docs/DESIGN.md)，当前一手资料与本轮优化依据见 [研究记录](docs/RESEARCH-20261029.md)。


### 本地 0.8：时间、存储和迁移（尚未发布）

支持未来生效和获知时间查询、修订冲突与有限版本；默认 JSON 防止旧副本覆盖，可显式接入异步快照存储。按主体搬运当前值前可预览新增、更新和冲突，整批失败不半写。见 [说明与示例](docs/time-storage.md) 和 [复核记录](docs/0.8-AUDIT.md)。SQLite、完整事件溯源与 0.9 候选学习尚未实现；仍到完整 1.0 验收后统一发布。


### 本地 0.9：受控学习（尚未发布）

有期限的候选审阅、受限抽取桥、可选的新字段接纳策略、带适用条件和宿主确认的经验，以及 CLI/HTTP 检查已齐。示例：npm run example:learning。见 [使用说明](docs/learning.md)、[复核](docs/0.9-AUDIT.md) 和 [1.0 候选关卡](docs/1.0-CANDIDATE.md)。
