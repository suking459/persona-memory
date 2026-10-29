# persona-memory

**面向用户、项目和任务的通用记忆库。** 支持有范围的检索、纠错、时间版本、候选审阅和可选关系状态。JavaScript / TypeScript，核心零运行时依赖。

Host-independent agent memory: typed records, scoped retrieval, temporal versions, reviewed learning, and optional relationship state.

这是一个可嵌入应用的 Node.js 组件。应用负责模型调用、身份授权和业务执行，库负责记忆的保存、选择、更新、过期与使用确认。核心不需要模型密钥；接入外部抽取器时由应用主动调用。

## 可以用在哪里

| 用途 | 可以保存和使用的内容 | 接入方负责什么 |
|---|---|---|
| 个人/办公助手 | 用户偏好、长期要求、临时状态 | 用户授权、实际模型调用 |
| 编程/项目助手 | 项目规范、技术决定、任务状态、带条件的处理经验 | 确认代码/任务结果，按项目选择记忆 |
| 客服与业务助手 | 客户偏好、已确认事项、工单状态和下一步约束 | 身份权限、工单和订单等业务真值 |
| 游戏 NPC、社区与陪伴机器人 | 角色状态、事件、关系维度、沟通风格 | 剧情/事件确认、平台连接 |
| 多工具或多个 agent 协作 | 明确映射的项目/任务记录和有界上下文 | 工具执行、跨主体授权、写入冲突处理 |

完整场景、组合方式和接入选择见 [用途与选型](docs/use-cases.md)。

## 1.0 的能力

- **明确的主体与类型**：user / project / task；preference、fact、constraint、decision、episode、state 六种记忆，支持 JSON 值、来源和证据编号。项目事实独立于关系评分。
- **有范围的检索**：按主体、类型、来源、字段与时间筛选，使用本地词法匹配和可解释排序；返回选中/省略原因，约束处理量和上下文长度。
- **纠错与时间**：明确替代和修订前置条件；保留有限版本，支持未来生效、过期和“在某时已知什么”的查询。
- **受控学习**：外部抽取结果先形成有期限候选，可接受、拒绝、修订；可显式开启只接纳新字段的有限策略。任务经验保留适用条件和宿主确认信息。
- **可靠存储与搬运**：JSON 文件、内存快照、自定义异步存储；默认文件锁和内容修订检查，选择性导出、映射预览与整批导入。
- **可选关系状态**：真实互动、熟悉程度/信任维度、可纠正标签、过期/衰减与本地风格统计；社群、陪伴、客服、NPC 四套预设。
- **实际使用确认**：查看或预览不增加使用次数；一次成功模型调用按 turnId 确认，重试有界去重，组合上下文可原子确认。
- **数据管理**：应用/频道范围、删除主体、清空、维护、诊断、快照迁移；失败保留原状态或原文件，不静默覆盖坏数据。

当前快照为 schema 5，支持读取并迁移 schema 1–4。升级与回退见 [迁移说明](docs/migration.md)。

## 安装

GitHub v1.0.0 源码：

```sh
npm install "github:suking459/persona-memory#v1.0.0"
```

也可以从 [GitHub Release](https://github.com/suking459/persona-memory/releases/tag/v1.0.0) 下载 persona-memory-1.0.0.tgz 后：

```sh
npm install ./persona-memory-1.0.0.tgz
```

npm registry 的发布独立管理；不要用 registry 中的旧版本判断本页接口。部署选择维护中的 Node LTS。Node 18/20 保留兼容测试，具体范围见 [接入与验证](docs/integrations.md)。

## 最小示例：项目记忆与上下文

将下面保存为 example.mjs，然后 node example.mjs：

```js
import { PersonaMemory } from 'persona-memory';

const pm = new PersonaMemory({
  storage: './data',
  scope: 'my-assistant',
});
const project = { type: 'project', id: 'my-project' };

pm.putMemory({
  id: 'response-format-v1', // 稳定 ID 允许相同内容安全重试
  subject: project,
  kind: 'constraint',
  key: '回答格式',
  value: '使用中文，先说结论，再给必要细节',
  source: 'user',
  evidenceId: 'settings-1',
});

const context = pm.buildMemoryContext({
  subject: project,
  query: '回答格式',
  budget: 1600,
});
console.log(context.text);
pm.flush();
```

应用将 context.text 作为参考资料交给实际模型。成功使用后可调用 pm.confirmContext(context, {turnId:'unique-turn-id'})，再保存；单纯打印、查看或请求失败不确认。上下文内文字不获得执行或授权地位。

未配置 storage 时纯内存运行。JSON flush 是同步磁盘操作；冲突返回明确错误，由应用处理后显式重试。自定义异步存储使用 PersonaMemory.open、persist、reload。详见 [API](docs/API.md)、[检索与模型桥](docs/retrieval.md) 和 [时间与存储](docs/time-storage.md)。

## 接入方式

| 方式 | 入口 | 说明 |
|---|---|---|
| Node.js / TypeScript | PersonaMemory | 应用直接记录、检索、确认与保存 |
| HTTP | persona-memory-http | 其他语言调用；默认仅回环地址，可配置 Bearer，管理写入需显式开启 |
| MCP stdio | persona-memory-mcp | 按需查询与关系消息记录；应用仍需组织完整记录流程 |
| 审阅 CLI | persona-memory-review | 用 JSON 请求查看、接受、拒绝、修订候选和检查经验 |
| OneBot / Discord | adapters/onebot、adapters/discord | 平台消息规范化；Discord 有离线解析和 bot 示例 |
| 通用模型桥 / LangChain | adapters/memory、adapters/langchain | 显式把上下文传给模型或 Runnable，成功后确认 |
| LlamaIndex TS | adapters/llamaindex | 可选历史兼容桥接；不作为核心依赖 |

MCP/HTTP 配置与框架的已验证版本见 [接入说明](docs/integrations.md)。HTTP 管理服务需要宿主配置授权，scope/subject 选择不等于访问控制。

## 示例与开发验证

克隆仓库后：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run example:memory
npm run example:retrieval
npm run example:time-storage
npm run example:learning
npm run demo
# 规则演示：http://127.0.0.1:7788
```

demo 展示社群、陪伴、客服、NPC 的状态变化与上下文，不需要密钥。可选框架的示例依赖仅用于开发，不进入核心运行时依赖。

```sh
npm test
npm run typecheck
npm run evaluate
npm run evaluate:retrieval
npm run evaluate:learning
```

已完成 Windows 六个、Ubuntu 五个运行时组合的本地验收，覆盖坏编码、超量输入、迟到结果、写入竞争、真实进程中断和离线安装。Linux 本地验收使用隔离 TCG 虚拟机及明确的测试等待倍率；生产期限不变。实际矩阵、次数和边界见 [加固记录](docs/1.0-HARDENING.md)；本次发布的远程检查见 [Actions](https://github.com/suking459/persona-memory/actions/workflows/ci.yml)。

## 边界

- 检索为有界词法检索；向量检索、完整文档 RAG、跨平台身份自动合并、完整事件溯源、SQLite 和后台任务执行引擎不在 1.0 范围。
- 规则与来源标签不证明事实真实；候选抽取器、业务结果和经验确认由接入应用提供。核心不自动后台学习或调用付费模型。
- 默认文件存储验证了本地文件和遵守同一协议的写者；网络文件系统、断电持久性与外部编辑器不在该保证内。Node --permission 的 fsync 限制见存储说明。
- 确定性样例和跨系统测试不代表真实模型准确率、长期平台兼容或任何环境下零 bug。没有宣称实时 Discord 或 QQA 集成已经验证。

## 资料

[API](docs/API.md) · [通用记忆](docs/typed-memory.md) · [检索](docs/retrieval.md) · [时间/存储](docs/time-storage.md) · [受控学习](docs/learning.md) · [六个配方](docs/cookbook.md) · [参数预设](docs/tuning.md) · [迁移](docs/migration.md) · [1.0 发布说明](docs/releases/1.0.0.md)

设计取舍与历史复核见 [路线](docs/ROADMAP.md)、[设计](docs/DESIGN.md)、[研究记录](docs/RESEARCH-20261029.md)。

MIT。早期关系设计参考 [Kondius/qq-agent](https://github.com/Kondius/qq-agent) 的 memory-tree，现有核心和通用记忆模块由本项目独立实现并持续演进；保留原有版权与来源记录，见 [NOTICE](NOTICE.md) 和 [LICENSE](LICENSE)。
