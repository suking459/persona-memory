# 按问题检索与通用记忆上下文

适用于 1.0，快照 schema 5。核心使用有界词法检索，不调用模型、不依赖向量服务。时间区间与存储见 [时间与存储](time-storage.md)，候选审阅与宿主抽取见 [受控学习](learning.md)。

## 选择范围，再检索

```js
const project={type:'project',id:'project-a'};
const owner={type:'user',id:'owner'};

const found=pm.searchMemories({
  subjects:[project,owner],
  query:'这个项目什么时候发布？',
  kinds:['constraint','decision','fact'],
  limit:5,
});
console.log(found.matches.map(hit=>({
  id:hit.record.id,key:hit.record.key,score:hit.score,reasons:hit.reasons,
})));
```

subject 与 subjects 必须且只能提供一种；最多 32 个明确主体。主体类型、ID、可选 chatId 全部精确匹配，不猜测身份或跨项目关联。指定范围不等于授权，宿主必须先判断调用者是否有权访问这些主体。

当前、生效于查询时刻且未过期的记录才能参与检索。已被替代、过期或相对 now 尚未创建的记录不会因外部相关度分数而重新出现。now 用于可控时钟，不提供完整历史 as-of 语义。

## 参数与结果

| 参数 | 默认/上限 | 作用 |
|---|---|---|
| query | 可空，最多 1024 个 UTF-16 代码单元 | 查询关键内容；空串表示显式列出该范围的当前记录 |
| kinds / keys / sources | 可选；最多 6 / 32 / 6 项 | 按类型、精确字段、来源筛选；空数组表示不选任何项 |
| observedAfter / observedBefore | 可选毫秒时间，含边界 | 筛选证据获知时间，不把使用时间当作新证据 |
| limit | 10，最大 1000 | 返回匹配条数，0 可只看统计 |
| maxCandidates | 1000，最大 10000 | 在元数据筛选后最多检查多少候选 |
| minScore | 0，最大 1024 | 最低相关性分数；不是事实可信概率 |
| relevance | 最多 1000 个 {id,score} | 宿主预先算好的相关度，score 在 0–1；不触发外部回调或模型调用 |

默认策略对查询和可检索文本做 Unicode NFC 与小写规范化，使用中文等 CJK 字符片段和字面单词。保留 C++、1.0 等查询标识；存储中的连接字段可拆成单词供自然查询。匹配字段名和 value，不从关系分、ID 或查看次数推断相关性。

这不是通用语义理解、同义词推断或行业事实验证。例如中文内容未必命中英文同义问法。宿主可将 embedding/检索器的预计算结果放进 relevance；它仍不能绕过范围、状态、来源和时间过滤。

matches 返回完整记录、相关度、命中词、原因及 lexical/external/hybrid/filter 方法。结果是独立副本。没有命中就返回空，不用最近的无关条目填充。

总字面文本处理量另外限制为 1000000 个 UTF-16 代码单元。scannedCharacters 表示已处理量；omitted.workLimit/textLimit 说明没有完整搜索的工作量，truncated 在这种情况下为 true。matched 只是已检查部分的命中数。返回条数限制另在 omitted.resultLimit 记录，不等同于工作量未完成。

## 生成有预算的上下文

```js
const context=pm.buildMemoryContext({
  subjects:[project,owner],
  query:'什么时候发布？',
  budget:2000,
  maxRecords:8,
});
console.log(context.text);

// 宿主把 text 作为资料传入实际模型；成功使用后再确认。
const usage=pm.confirmContext(context,{turnId:'request-1'});
// {confirmed:true,tagCount:0,memoryCount:...}
```

预算包含标题、完整 JSON 记录、主体、来源和时间信息。放不下时省略整个条目，不截断值再当完整记忆。budget 默认沿用 maxChars，范围 0–100000；maxRecords 默认 8、最大 64。返回 records、omitted/omittedCount、字符数和检索统计。

可同时给 tokenBudget 与纯同步 countTokens(text)；回调必须返回非负整数，最终输出也会再检查。回调在构建期间修改通用记忆会使本次预览失败，防止保存旧内容的确认引用。HTTP/MCP 的 JSON 参数不能提供函数，因此使用字符预算。

预算只覆盖该记忆块，不包含宿主的其他系统提示、消息、附件或其他上下文。组合多个块时，宿主负责总输入预算。

JSON 中换行、引号和方向/行分隔控制字符会转义，记录内容仍可按 JSON 还原。输出明确标为资料，不表示其中任意文字获得执行权限；宿主仍负责模型输入的角色与权限设计。

## 固定约束与按需资料并用

有些项目约束需要每次提供，不能只期待关键词查询命中。宿主可明确构建一个 kinds:['constraint']、query:'' 的块，再构建当前问题的检索块；检查省略项和总预算后，把两者一起用于模型调用。

```js
const rules=pm.buildMemoryContext({subject:project,kinds:['constraint'],query:'',budget:1000});
const relevant=pm.buildMemoryContext({subjects:[project,owner],query:question,budget:1500});
// 在一次成功的模型调用后，整体确认；同一记录不会重复计数。
pm.confirmContexts([rules,relevant],{turnId:'request-2'});
```

也可把同一 chat 的关系上下文一起确认。一次组合最多 16 个上下文，合计最多 64 个不同通用记录、32 个主体；跨多个 chat 的关系块需分别组织。任何一个凭据失效或超限，整组都不改变计数。全组重叠记录/标签只计一次，并只保留一条轮次使用摘要。

预览不改变持久状态。确认不会刷新通用记忆的 observedAt、expiresAt、revision，也不会把模型使用次数当作真实性证据。被纠正的旧版本不会获得新版本的使用确认；删除或导入会使相关预览失效。

凭据当前实例内最多 128 个、有效 10 分钟、不跨重启。使用去重受 dedupeLimit/dedupeDays 和数据删除约束，不是永久调用账本。删除主体也会清理该主体的空结果确认记录和待确认凭据。

## 不绑定厂商的调用桥

```js
import {createMemoryBridge} from 'persona-memory/adapters/memory';
const bridge=createMemoryBridge(pm,{subjects:[project,owner],budget:2000,timeoutMs:30000});

const result=await bridge.invoke(
  {text:'这个项目什么时候发布？',turnId:'request-3'},
  async ({text,memory},{signal})=>{
    // 接入自己使用的 SDK，并实际把 memory 放入模型参考资料。
    // 支持取消的客户端应传递 signal。
    return callYourModel({text,memory,signal});
  },
);
```

桥接只读取并注入已有记忆，不自动从输入学习事实或创建关系档案。text 最多 100000 字符；较长原文可另提供短 query，查询上限仍是 1024。构造时指定 query 可用于固定检索，invoke 的 query 可逐次覆盖。

成功、并发重试共用一次调用；相同 turnId 换 text/query 会报错。轮次 ID 去除首尾空白后统一处理，非法 ID 在调用前拒绝。失败不确认，可由宿主明确重试；默认不自动重试。超时请求取消，迟到结果不能确认。忽略取消的外部任务与同步无限循环仍需要宿主的进程/Worker 边界。

call 必须在最终输出成功完成后返回。流式 SDK 要在回调内部消费到完成，再返回最终结果；直接返回尚未消费的流会拒绝并请求取消，避免提前记作成功。调用方在等待时改动自己的输入对象，不会改变本次已捕获的轮次标识。

运行 npm run example:retrieval 可看无需密钥的完整机制演示；它不证明真实模型回答质量提高。

## HTTP 与 MCP

HTTP 沿用回环服务、可选 Bearer token 和写请求来源检查：

- POST /api/memory/search、/api/memory/context、/api/memory/get 提供读取。
- POST /api/confirm 可确认通用上下文；/api/confirm-contexts 接收 contextIds 数组，一次确认组合。
- /api/memory/put、/api/memory/forget、/api/memory/delete-subject 必须显式 allowAdmin/PM_ALLOW_ADMIN=1。
- 记录冲突或容量已满返回 HTTP 409 和 code，参数问题返回 400；写入失败不伪装成成功。

MCP 增加 memory_search_records、memory_records_context、memory_get_record、memory_confirm_contexts。没有新增让模型默认任意写通用事实的工具。宿主驱动的记录和确认仍更可靠；可选模型工具调用不保证每轮都发生。

## 数据与验证边界

当前使用 schemaVersion=5，支持迁移旧格式。使用摘要可包含 recordIds 与 memorySubjects，导入会校验其结构与数量。值和原查询不写进使用摘要。内部批次回滚也应恢复对应备份，不让旧开发代码直接处理新确认元数据。

本地新增检索单元、接入、回放、进程外 watchdog 及复核用例；33 个合成检索样例覆盖个人、项目、学习、创作与边界。它们不是生产准确率、完整 LongMemEval 或模型效果对照。

最新修订尚需最终跨平台/Node 支持矩阵。QQA 与其他应用未改动，未读取真实聊天，未调用收费模型；仍到完整 1.0 验收后统一发布。


## 0.8 生效区间与异步持久化

默认检索和上下文按当前生效区间取值；status=current 的未来版本头暂不进入当前结果，上一版可能仍生效。上下文包含 validFrom/validUntil 并计入完整预算。模型桥异步路径等待 persist 并再次检查截止时间；迟到的存储返回不能启动模型。新快照 schema 4、存储错误和选择性迁移见 [时间与存储](time-storage.md)。
