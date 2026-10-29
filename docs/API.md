# API 与数据语义

状态：本地 1.0 候选；package 版本暂保留 0.4.0，当前新增能力尚未推送或发布。核心入口为 PersonaMemory，规则纯函数仍可独立导入。

## 通用记忆（本地 0.6 批次）

putMemory/getMemory/listMemories/forgetMemory/deleteSubject 提供用户、项目、任务的结构化记录，详见 [完整说明](typed-memory.md)。独立于关系分与标签，不自动提取或注入旧的 buildContext。searchMemories/buildMemoryContext 提供独立的通用检索与上下文；confirmContexts 可以将其与关系块一并确认，见 [0.7 说明](retrieval.md)。当前新快照输出 schemaVersion=5，读取并迁移 schema 1/2/3/4。

## 实例与范围

new PersonaMemory({storage, persona, scope, config, clock})

- persona 默认 default，用于区分角色；不是 botId。
- scope 默认空，表示应用/租户范围。非空 scope 的文件名由 scope 与 persona 的组合摘要生成。
- config.tagScope 默认为 user：同一实例内标签/访客按用户共享，关系分数按 chatId+userId 保存。chat 模式下标签/访客也按频道隔离。
- 应用应该显式命名 chatId 和 userId，平台适配器负责平台边界；不要自动猜测跨平台身份。
- clock 默认 Date.now；测试/回放可传入可控时钟。所有时间为毫秒。
- storage 为 null 时不写盘。默认 JSON 用锁与内容修订拒绝冲突；自定义存储的并发原子性由宿主实现，详见 time-storage.md。

## 记录消息

ingest({chatId,userId,text,ts?,eventId?,mentionsSelf?,replyToSelf?,directedToBot?,mentions?,replyTo?,isSelf?})

显式 mentionsSelf/replyToSelf 优先；否则识别 self 标记或配置的 botId。directedToBot 用于私聊等没有 @ 的直接互动；最近一次明确互动后的 attentionWindowSec 内可算续聊。

默认不对旁观消息计关系分。scoreAmbient=true 可恢复旧版对旁观夸奖/辱骂等词表计分的行为。

eventId 去重范围为当前实例的 chatId+userId；保留受 dedupeDays/dedupeLimit 限制，不承诺永久去重。旧于当前档案或维护时间的消息返回 ignored，不倒退时间或重置日额度。没有 eventId 时不保证重复消息不重复计数。

返回 matched、实际 delta、reasons，以及可选 tags/visitor/duplicate/ignored。机器人自己的消息忽略，不会把机器人回复计入人的风格。

## 预览和实际使用

```js
const context = pm.buildContext({
  chatId: 'room', userIds: ['a','b'], priorityUserIds: ['b'],
  budget: 700, maxPeople: 4,
});
// context: {contextId, text, people, omitted, budget, characters, createdAt}
const block = pm.buildBlock({chatId:'room', userIds:['a']}); // 纯文本兼容入口
```

排序优先显式关注的人，再看最近活跃与关系分。只考虑传入的人；访客也计入人数上限。超过预算时省略整行或标签，不截断标签再当作完整注入。显示字段会去除换行控制字符；宿主仍需将上下文当作资料，而非可执行指令。标签和完整 advice 一起计入预算，放不下时整项省略。存在当前状态建议时，不附加可能冲突的通用关系语气。config.affinityContext=false 可省略上下文中的关系档位、分数和语气；客服预设默认关闭，getProfile 仍可查询分数。客服也默认关闭通用社交状态词表，宿主通过 setTag 同时提供业务状态与 advice。

可选 tokenBudget 与 countTokens(text) 回调同时传入，才能约束精确 token 预算。HTTP/MCP 的普通 JSON 参数不能携带 tokenizer 回调，默认使用字符预算。characters 计算 Unicode 码点，不等价于 token。

预览不增加 injections，不修改导出状态。contextId 是当前实例的短期确认凭据，最多保留 128 个，10 分钟有效，不跨重启。

```js
// 仅在该上下文实际用于一次模型调用后执行。
pm.confirmContext(context, {turnId:'unique-turn-id'});
pm.flush();
```

同一个 turnId 在使用记录保留范围内只计一次。标签被替换或移除后，旧预览不能确认。只记录真正包含在该上下文中的标签。

## 纠错与宿主事件

```js
pm.setTag({chatId:'room',userId:'a',tag:'找工作中',source:'host',eventId:'case-1'});
pm.setTag({chatId:'room',userId:'a',tag:'已入职',source:'host',replace:['找工作中']});
pm.removeTag({chatId:'room',userId:'a',tag:'已入职'});
pm.recordEvent({chatId:'room',userId:'a',type:'promise-kept',eventId:'quest-1',changes:{trust:10}});
```

setTag 的 advice 必须为字符串，最多 2000 个 UTF-16 代码单元（与规则配置一致），同名状态更新会替换建议。setTag 的 expiresAt=null 表示宿主设置长期状态；这类状态仍遵循长期保鲜规则。source 是 provenance，不是置信概率：builtin/extra 表示词表观察，host/manual 表示宿主或人工设置，model 表示外部模型提供。

recordEvent 只接受已启用的 dimensions，且来源应是宿主确认的事件，不把模型随意输出当作授权。dimensions 是可选扩展；不开启时保留单值关系分。

## 查询与删除

getProfile(chatId,userId)、getVisitor(userId,{chatId?})、listVisitors(limit)、diagnostics()、history({chatId?,userId?,subject?}) 返回脱离内部引用的结果。chat 模式查询访客必须提供 chatId。

deleteUser(userId) 删除当前实例内该用户的关系、标签、访客、使用记录与诊断历史。指定 chatId 仅删除该会话；user 共享模式下若其他会话还有该用户，保留共享标签。clear() 清空当前实例范围，之后 flush 落盘。它们不会处理调用方另存的旧备份或外部日志。

## 维护与存储

maintain(now?) 进行按时间增量衰减、标签过期/晋升/降级和保留上限清理，目录存储调用 flush；纯异步存储需随后 await persist。返回 memoriesExpired 表示过期通用记录数。维护不把最近真实互动时间改成维护时间。

短期标签默认 48 小时，晋升需要仍未过期、存活 3 天且实际使用至少 6 次，因此没有新命中/确认的单次观察会先过期，不会只靠被模型反复看到变成长期事实。长期状态 7 天无新证据会降级，旧的使用次数不能让陈旧证据反复晋升；没有新证据时在短期寿命结束后过期。

export() 返回 schemaVersion=5 快照，包含独立的 memories 集合。import(snapshot) 先完整校验再替换，失败不改变现有状态。支持旧 schemaVersion=4/3/2，以及默认 user 共享语义的旧 schemaVersion=1；导入时 persona/scope/存储语义必须一致。见 migration.md。

损坏/未知版本文件导致构造时报错并保留原文件；宿主可以捕获后选择无记忆降级。不能静默覆盖坏文件。完整 import 只接受普通 JSON 数据，不执行 getter/toJSON；总编码字节受 config.maxSnapshotBytes 限制，同时限制嵌套深度 32 和节点数 2,000,000。该校验覆盖未知字段；不接受稀疏数组、访问器、隐藏或 Symbol 属性。

JSON 文件须为普通文件；拒绝符号链接、设备和 FIFO。UTF-8 解码错误明确失败；实际读取最多 maxBytes+1 字节后判断是否超限，避免文件在读取期间增长绕过长度检查。

## HTTP 与 MCP

HTTP 默认回环地址 8791，可用 PM_TOKEN 启用 Bearer 鉴权。写请求要求 application/json。GET health/profile/stats；POST ingest/context/confirm/maintain。tags/remove-tag/delete-user 管理接口需显式 PM_ALLOW_ADMIN=1。

MCP 提供 memory_record、memory_context、memory_confirm、memory_profile。stdio 仅写协议输出；模型可选工具调用无法保证消息记录完整，可靠接入优先使用库或 HTTP。

HTTP/MCP 存储环境变量：PM_STORAGE、PM_PERSONA、PM_SCOPE。不要将实际凭据放进版本库。

HTTP 所有请求的 Host 必须是 127.0.0.1、localhost 或 [::1]，且端口匹配实际监听端口；默认地址仍为回环。反向代理需把后端 Host 改为该回环地址和实际端口，不能直接保留公网 Host。POST 的 Origin 继续要求相同本地端口和 http 协议；Host/Origin 校验不替代宿主鉴权。HTTP/CLI/MCP 拒绝非法 UTF-8。MCP stdio 逐项处理请求并等待 stdout drain 后继续，不会在输出阻塞时无限堆积请求；上限为 1 MiB 的待解析输入，EOF 可处理没有换行的完整末条消息。


## 时间、存储和选择性迁移

getMemoryAt、expectedRevision/validFrom、maxVersionsPerMemory，以及 PersonaMemory.open/persist/reload、JsonFileStore/MemorySnapshotStore、exportMemories/previewMemoryImport/applyMemoryImport 已在本地实现。参数、异步错误和旧格式升级边界见 [时间与存储](time-storage.md)。status=current 表示最新版本头，生效值以默认读取/检索的区间选择为准。


## 候选审阅与经验

proposeMemory/proposeMemories、getCandidate/listCandidates、reviseCandidate/rejectCandidate/acceptCandidate/acceptCandidates/forgetCandidate，以及 recordExperience/listExperiences 已实现。候选默认不检索、不接纳；正式值基于明确的原版本和宿主审阅。schema 5 含独立 candidates；参数、类型和错误见 [受控学习](learning.md)。
