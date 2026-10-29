# 受控学习、候选审阅与任务经验

适用于 1.0，数据格式 schema 5，核心无运行时依赖。抽取器默认禁用，需要宿主主动提供回调和凭据；没有后台学习进程、自动付费请求或重试循环。

## 先提出，再接纳

```js
const subject = {type:'project',id:'work'};
const candidate = pm.proposeMemory({
  memory:{subject,kind:'constraint',key:'release',
    value:'after complete checks',source:'user',evidenceId:'request-1'},
  reason:'明确的项目要求', confidence:0.9
});
console.log(pm.listCandidates({subject,status:'pending'}));
console.log(candidate.memory, candidate.base); // 可审阅的值、来源和原版本
const revised = pm.reviseCandidate(candidate.id,{
  expectedRevision:candidate.revision,
  memory:{value:'after all required checks'},reason:'宿主修订'
});
const accepted = pm.acceptCandidate(revised.id,{expectedRevision:revised.revision});
// 也可以 rejectCandidate(id,{expectedRevision,reason})。
await pm.persist();
```

候选不进入 searchMemories/buildMemoryContext，也不创建关系档案。接受才写入正式记忆。来源标签、reason、confidence 都是报告信息，不是独立的真实性证明或执行权限。

每个候选绑定提出时的正式版本：版本头 ID、revision 和确定性指纹。若正式记录后来被纠正、删除或替代，旧候选无法覆盖新值。修订候选不会偷偷刷新这个前置条件；需要新的审阅和新候选。序列化/重载保留此约束。acceptCandidates([{id,expectedRevision},...]) 可原子接纳最多 32 个；任一冲突、容量或数据错误都不会半写。

pending → accepted/rejected 是终态转换；终态不能再次修订或改判。重复接受/拒绝相同修订是纯重试。接受结果返回 {candidate,record,duplicate}；已接纳的正式版本后来被裁剪时，重复接受可能返回 record=null，不会重建它。

默认候选 ID 由规范化的主体、类型、key、value、来源、evidenceId 生成。相同候选不增长池、不续期；重复提议保留第一次的 reason/confidence。明确 ID 对应不同记忆内容会报 ERR_CANDIDATE_CONFLICT。该机制不做语义改写去重；不同表达仍受数量和字节上限约束。

## 寿命、容量与删除

candidateTtlHours 默认 72，上限 720 小时。ttlHours 可按次覆盖到 0..720；修订/审阅不延长原截止时间。若正式内容是短期 state，候选截止时间不会晚于该内容的 expiresAt，避免过期观察经审核后重新变新鲜。memory.expiresAt 是正式内容期限，候选自身 expiresAt 是审阅/保留期限，两者分开。

maxCandidates 默认 1000、最高 10000；maxCandidateBytes 默认 4 MiB、最高 16 MiB。已接受/拒绝的行在其候选期限内也计入容量，以保持有限去重和可检查的决定。maintain 清理过期候选，返回 candidatesExpired。设容量/字节为 0 可禁用候选写入，空快照仍可恢复。

forgetCandidate(id) 只删除候选，不撤销已经接纳的正式内容。forgetMemory(正式记录 ID) 删除该字段的保留正式版本及相关候选；deleteSubject/deleteUser/clear 包含候选及相关审阅历史。删除还会使正在抽取的结果失效。已复制到宿主外部的材料、原始消息和备份仍由宿主管理。

去重有期限；候选和所有相关身份记录删除后，重新提交旧原文可能生成新候选。核心不保存无限 tombstone，也不自动从外部聊天记录补回删除内容。宿主不应把已经删除的原文继续自动重放。

## 可插拔抽取器

```js
import {createMemoryLearner} from 'persona-memory/adapters/learning';
const learner = createMemoryLearner(pm,{
  subject:{type:'user',id:'u'}, kinds:['preference'],
  source:'model', timeoutMs:30000, maxCandidatesPerCall:16
});
const result = await learner.extract(
  {eventId:'message-1',text:'宿主提供的待处理文本'},
  async ({text,eventId,subjects,kinds},{signal}) => {
    // 这里由宿主调用模型、规则或离线程序，消费完流后返回数组。
    return [{subject:subjects[0],kind:'preference',key:'format',
      value:'short',reason:'示例',confidence:0.8}];
  }
);
```

输出只允许 subject/kind/key/value/reason/confidence/observedAt/validFrom/expiresAt。source 和 evidenceId 由宿主桥接器设置，抽取器不能自授 host 来源、替代 ID、修订号、接纳操作或经验验证标记。主体和类型必须在构造时明确指定的范围内。raw text 不写入快照或诊断历史。

同一桥的相同 eventId/输入共用一次调用；输入不同则拒绝。失败可显式重试。成功抽取但持久化失败时，重试复用已经提出的候选，不再调用外部抽取器。返回时重新读取候选审阅状态；已删除的缓存候选放入 unavailable，不复活。回调等待期间有正式记忆/候选纠错或删除，迟到结果整批拒绝。

输入最大 100000 字符，单次默认最多 16/最高 32 条，执行截止时间 1..300000 毫秒；并发/缓存槽位最多 128。截止时发送 AbortSignal，回调返回后也用单调时钟检查，迟到结果不能写入；同步执行死循环的外部回调无法被 JavaScript 定时器抢占，应由宿主隔离不可信代码。核心本身的数组、批次和状态增长均有上限。

内存提交与存储仍是两个阶段：候选/自动接纳的内存变更是原子的，外部存储失败不会回滚本地内存。存储等待超时后有效快照仍可能保存；见 [存储契约](time-storage.md)。没有默认的递归总结或“学完再学”调用链。

## 有限的自动接纳

自动接纳默认关闭，必须由宿主明确设置：

```js
const learner = createMemoryLearner(pm,{
  subject, source:'rule',
  autoAccept:{kinds:['preference'],minConfidence:0.9,maxPerCall:1}
});
```

它仅接纳允许类型、达到报告置信度、尚未过期且目标字段从未建立正式值的候选。已有字段、未来计划或残缺版本都保留供审阅；每次最多 8 条，同字段只取一条，其余返回 omitted 原因。提出候选和自动接纳整批提交，失败不半写。

minConfidence 不是准确率保证，模型/规则报告的数值可能错误。启用策略是宿主的显式选择，不能由抽取文本扩大授权范围。proposeMemories(inputs,{autoAccept}) 也可供纯宿主程序使用。

## 带适用条件的任务经验

```js
const experience = pm.recordExperience({
  subject:{type:'task',id:'release-check'},key:'offline-method',
  task:'检查发布包', context:{environment:'local'},
  attempt:'离线安装后回放', result:'本次合成案例通过',
  conditions:['离线','合成数据'],outcome:'success',
  verified:true,evidenceId:'host-run-report-1'
});
pm.listExperiences({subject:experience.subject,verifiedOnly:true,outcome:'success'});
```

这会写入 episode，默认 90 天期限，仍遵循版本、纠错和删除。outcome 为 success/failure/mixed/unknown；verified 默认 false。true 要求明确宿主报告、证据编号和已知结果，表示宿主确认这个结果，并非独立审计或普遍有效性证明。task/attempt/result 和 conditions 保留背景、尝试、结果和适用条件，不会自动把一次成功推广到其他环境。

验证信息存在独立 experience 元数据，不能靠 value 内的 verified:true 获得；模型抽取或一般 episode 文本不进入 listExperiences 的宿主报告集合。上下文会展示该元数据。修改结果使用 recordExperience({...replaceId,expectedRevision,...})；旧结果失效，不重复计数。

选择性跨应用搬运仅携带值/来源，不移交经验验证标记。目的应用需自行验证后报告；完整可信快照恢复可保留元数据。模型文本也不能因此获得执行任务的能力，本库没有任务调度器。

## 接入与检查

HTTP 只读 POST：/api/candidates/list、/api/candidates/get、/api/experiences/list。候选提议/批量提议、接受/批量接受、拒绝、修订、删除，以及 /api/experiences/record 均要求 allowAdmin=true；保持原 bearer/origin/1 MiB 边界。没有远程调用任意抽取插件的接口。ERR_CANDIDATE_CONFLICT 为 HTTP 409。MCP 仅增加 memory_experiences，不开放候选接纳或宿主经验写入。

轻量 CLI 使用单条 JSON stdin：

```powershell
$env:PM_STORAGE = './data'
'{"operation":"list","subject":{"type":"project","id":"work"}}' | npm run review
# get/accept/reject/revise/forget 使用 id，审阅修订放在 options 中。
```

PM_STORAGE 必须明确设置；可选 PM_PERSONA/PM_SCOPE。get/list 展示来源、值、原版本和决定，accept 必须带 options.expectedRevision。CLI 不把原文解释成命令。

`npm run example:learning` 是无密钥示例。`npm run evaluate:learning` 执行个人、项目、时间与任务经验的四个连续合成场景，只验证声明的确定性契约，不能替代真实抽取准确率或答案质量。

## 格式与研究边界

schema 5 必须含 candidates 集合。schema 1/2/3/4 支持迁移；真实旧 0.8 合成快照已验证未来计划不会提前生效。新文件由旧实现明确拒绝，回退使用升级前备份，不能只改版本号。

[LangGraph Memory](https://docs.langchain.com/oss/javascript/concepts/memory) 区分事实、经历与过程记忆，也讨论写入时机。我们据此选择明确的宿主调用与经验报告，自行实现候选审阅，不引入后台代理。[LongMemEval](https://arxiv.org/abs/2410.10813) 的跨会话、时间、更新和弃答维度用于组织测试；本项目没有运行该完整基准，也没有对应分数。候选机制和保守接纳策略是本项目的设计取舍，不是论文对本实现效果的背书。

实际验证记录见 [0.9 复核](0.9-AUDIT.md)，1.0 范围与验收要求见 [清单](1.0-CANDIDATE.md)。
