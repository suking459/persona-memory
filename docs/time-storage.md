# 时间版本、存储与记忆迁移

当前本地 0.9 / 1.0 候选已采用 schema 5；候选审阅、经验和旧格式迁移见 [受控学习](learning.md)。下文内部批次记录不代表已经发布。

时间与存储始于本地 0.8 批次，尚未发布。公开包版本保留 0.4.0；当前快照为 schema 5。运行示例：`npm run example:time-storage`。主体和 JSON 限制继续见 [通用记忆](typed-memory.md)，检索与模型接入见 [检索](retrieval.md)。

## 获知、生效和保留时间

| 字段 | 含义 |
|---|---|
| observedAt | 宿主报告的证据时间，不能晚于写入时间；不代表系统在那时已经保存这条记忆 |
| createdAt | 本实例写入该版本的时间 |
| updatedAt | 当前版本创建或被后续版本替代的获知时间 |
| validFrom | 宿主明确给出的生效时间，默认本次写入时间 |
| validUntil | 下一版本的生效时间，区间右端不包含；末版本为 null |
| expiresAt | 数据保留/使用期限，null 表示没有时间期限；不等于事实在世界中的失效时间 |

时间使用毫秒数。上述字段表示记录和宿主声明，不证明内容真实，也不推断自然语言中的“下周”。

```js
const project = {type:'project', id:'planner'};
const old = pm.putMemory({
  subject:project, kind:'fact', key:'channel', value:'preview'
});
const scheduled = pm.putMemory({
  subject:project, kind:'fact', key:'channel', value:'stable',
  validFrom:activationTime, replaceId:old.id, expectedRevision:old.revision
});
```

在 activationTime 前，getMemory/listMemories/searchMemories/buildMemoryContext 仍选择 old；到达边界时选择 scheduled。上下文展示生效区间并纳入预算。无须定时任务修改状态。state/episode 的默认 TTL 从 max(写入时间, validFrom) 起算，避免未来状态尚未启用就过期。

status=current 指最后提交的版本头，不保证它已生效；status=superseded 的上一版本可能仍处于当前生效区间。宿主更新时使用版本头的 ID 和 revision；可通过 listMemories({subject,kind,key,includeInactive:true}) 找到 status=current，而不能把默认查询的当前生效值直接当作未来计划的版本头。

同一字段更新必须明确 replaceId；可选 expectedRevision 是版本头修订号，新建预期为 0。已存在 ID 的完全相同重试仍是纯操作；不同内容或旧修订返回 ERR_MEMORY_CONFLICT。validFrom 不允许退到最新版本生效时间之前；这批没有实现任意历史插入、分叉合并或自动选择“更可信”的来源。宿主若需改变已经登记的远期计划，应先检查现有版本和业务需求，不用回填旧时间绕过冲突。

## 按时间查询有限历史

```js
const record = pm.getMemoryAt({
  subject:project, kind:'fact', key:'channel',
  at:effectiveTime,          // 想查询何时生效的值
  knownAt:knowledgeTime      // 可省略，默认当前 clock；不能晚于当前 clock
});
```

例如 2000 时获知某个值从 1500 生效：at=1600/knownAt=1800 返回当时已知的旧值；knownAt=2000 才看到修正。旧版本中尚未获知的替代编号/结束时间会隐藏。at 可以是未来，用于查看已经登记的计划，不是对未来事实的保证。

查询只基于仍然保留的记录；数据过期或版本裁剪后可能返回 null。null 表示没有可用的保留记录，不能证明历史上从未存在某个值。expiresAt 按 knownAt 检查，已经物理删除的数据不能靠历史时间恢复。

maxVersionsPerMemory 默认 32，上限 1000、下限 1。每次写入只裁剪最旧且区间已经结束的版本；仍生效或未来生效的版本不因数量上限而静默丢失，无法腾出空间时拒绝本次写入。maxMemories 仍限制全实例总记录数。裁剪同时移除相关使用/诊断引用；ID 去重仍只有有限保留保证。

若最新版本已因 TTL 被物理删除，但老版本片段仍在，不能重新从 revision=1 接着写。需要显式 forgetMemory(某个保留 ID) 清理该字段完整历史，再重新建立；deleteSubject 可删除整个主体。这样不会把未知的历史缺口当成一条完整版本链。

## 快照与兼容

export() 输出 schemaVersion=5；import() 先完整校验，再替换状态。schema 1/2 的关系数据继续迁移，schema 4 的时间区间保持原语义。schema 3 通用记录按旧版即时替代语义迁移：validFrom=createdAt，旧版本 validUntil=updatedAt。

schema 4 必须含完整时间字段。只修改 schemaVersion 不能降级；旧代码也会拒绝新格式。升级前保留旧数据和旧代码备份。对含重叠区间、重复修订或相互矛盾的残缺链，导入会明确失败；磁盘原文件保留，不猜测如何修补。旧 schema 3 也可能包含旧实现允许的歧义片段，这类文件需要宿主显式整理，不能保证任意历史文件都可无损自动修复。

## 默认 JSON 与并发写入

原有 `new PersonaMemory({storage:'./data'})`、同步 ingest/putMemory/flush 保持使用方式。每个文件保存最后读取内容的修订令牌。flush 在独占 .lock 下检查预期修订，写入同目录临时文件并 fsync，最后 rename。第二个旧副本写回时返回 ERR_STORE_CONFLICT；不会自动合并或循环重试。

```js
try { pm.flush(); }
catch (error) {
  if (error.code !== 'ERR_STORE_CONFLICT') throw error;
  // 先由宿主处理本地尚未保存的变化；明确选择丢弃时才这样调用：
  await pm.reload({discardChanges:true});
}
```

ERR_STORE_LOCKED 表示另一个写者持有锁；不自动抢占“看起来旧”的锁。进程异常退出可能留下锁文件，需确认写者已经停止后由宿主恢复。当前已在 Windows/Ubuntu 本地文件上验证两个本项目进程竞争，另有真实进程在 rename 前后被终止的恢复检查；详见 [多环境记录](1.0-HARDENING.md)。不能据此宣称网络文件系统、未遵守锁的编辑器、旧版本写者或任意多进程程序都安全。文件修订是内容哈希；字节完全相同视为相同内容，不是全局事件序号。

实现使用 Node 的独占打开、同步文件操作和重命名机制；Node 文档也说明独占标记在某些网络文件系统上可能不起作用。参见 [Node fs](https://nodejs.org/api/fs.html)。不声称具备数据库事务、目录级断电持久性或 Windows ACL 配置能力。

读取仅接受普通文件，拒绝符号链接/FIFO/设备；非法 UTF-8 不替换为其他字符。文件在 stat 后增长时仍受实际读取字节上限约束。写者只清理自己成功创建的临时文件，临时文件名碰撞不会删除他人的文件。进程被强杀可能留下自己的临时文件与锁，恢复前需确认写者确实停止；不自动循环重试。

Node 26 的 --permission 模式会禁用 fsync；本次实测即使授予目录读写权限，内置 JsonFileStore 仍会 ERR_ACCESS_DENIED，清理临时文件后失败。它不会通过跳过 fsync 声称保存成功。该环境可使用 MemorySnapshotStore 或宿主提供的存储；具体存储能力由宿主验证，不能把权限 smoke test 当作完整安全沙箱证明。

## 可插拔异步存储

```js
import {PersonaMemory, MemorySnapshotStore, JsonFileStore} from 'persona-memory';
const store = new MemorySnapshotStore(); // 仅当前进程内共享，不会落盘
const pm = await PersonaMemory.open({store, persona:'assistant', scope:'app'});
pm.putMemory({subject:{type:'task',id:'t'},kind:'decision',key:'step',value:'check'});
await pm.persist();
await pm.reload(); // 有未保存的本地修改时，默认拒绝

const fileStore = new JsonFileStore({file:'./data/shared.json'});
// JsonFileStore 的异步方法包装同步磁盘实现，不是后台 I/O。
```

宿主也可提供以下接口：

```ts
interface SnapshotStore {
  read(): Promise<{snapshot:MemorySnapshot|null, revision:string|null}>;
  write(snapshot:MemorySnapshot, options:{expectedRevision:string|null}):
    Promise<{revision:string}>;
}
```

空存储使用 snapshot=null/revision=null；成功写入返回非空字符串令牌。自定义存储必须在其真实存储层原子比较令牌并提交，单纯先 read 再 write 不满足协议。核心负责验证快照、身份、容量和返回格式，无法代替外部存储实现 CAS。SQLite 未包含在本批。

同时仅允许一个 persist/reload，重叠返回 ERR_STORE_BUSY。persist 保存调用开始时的快照；等待期间的新修改保留为 dirty，下一次再保存。reload 等待期间若内存变化，则拒绝替换，保留本地修改。失败不自动重试。异步存储的超时/取消由宿主实现；任意挂起的外部存储不会被核心强行中断。

flush 对纯异步存储明确报 ERR_STORE_ASYNC；maintain 保持同步并返回清理结果，需要随后 await persist。模型桥、HTTP 与 MCP 的异步调用路径会等待 persist；模型桥在等待结束后再次检查截止时间，迟到的保存不会启动模型调用。超时前已提交给存储的有效快照仍可能保存成功，不能把模型超时解释为撤销存储。

内存修改与存储提交是两个明确阶段。持久化失败时，本地修改仍保留；不是数据库级回滚。构造默认目录存储的原有 maintain 会同步 flush。

## 选择性搬运当前值

exportMemories 只导出明确选择的主体/类型/key/source 中当前生效的值，不带关系分、聊天、使用记录、候选或完整版本图。未来计划不在此格式中；它是导出时的一份值快照，不会在目的地自动同步源应用后续的替代时间。完整版本恢复使用 export()/import()，并保留原 persona/scope。

```js
const bundle = source.exportMemories({
  subject:{type:'project',id:'source'}, kinds:['constraint','decision']
});
const preview = target.previewMemoryImport(bundle, {mappings:[{
  from:{type:'project',id:'source'},
  to:{type:'project',id:'destination'}
}]});
console.log(preview.counts, preview.rows); // add / same / update / conflict
// 宿主审阅后使用此计划编号；修改已有字段需明确 allowUpdates。
const applied = target.applyMemoryImport(preview.planId, {allowUpdates:true});
await target.persist();
```

每个源主体都必须显式映射，连同名主体也不隐式合并。目标新 ID 由来源条目和映射生成；原 ID 仅作来源标识。value/source/证据和时间保留，但来源标签不授予任何执行、授权或真实性地位。完全相同的重复导入为 same；源条目过期、未来生效、目标已有未来计划、目标残缺历史、旧导入已被纠正或多个源字段映射到同一目标字段，均保留为 conflict。

有任意 conflict 时整批拒绝。update 默认拒绝，只有 allowUpdates=true 才可应用。容量/修订错误不会留下先前几行的半次写入。计划 10 分钟有效，任意通用记忆修改后需重新预览；不持久化计划。删除/清空会释放相关的待导入值。

限制：最多 1000 条、4 MiB、32 个主体映射；预览池最多 128 个且合计约 8 MiB，超出时淘汰最早的未应用计划。大库导入另有 (已有记录数+本批条数)×本批条数≤2,000,000 的处理量限制，超出时分小批处理。超限明确拒绝，不静默截断。HTTP 继续有更小的 1 MiB 请求限制。

## HTTP / MCP

POST /api/memory/at 使用 getMemoryAt 参数。以下 HTTP 操作要求原有 allowAdmin=true/PM_ALLOW_ADMIN=1，并继续遵循 bearer 与 origin 规则：

- /api/memory/export：请求为选择条件，返回 {bundle}。
- /api/memory/import-preview：{bundle,options:{mappings}}。
- /api/memory/import-apply：{planId,options?:{allowUpdates}}。

MCP 新增只读 memory_at；没有默认向模型开放迁移写入。显式主体选择不是细粒度 ACL，宿主仍负责检查调用者是否能访问对应主体。

## 设计依据和范围

[Zep 时间字段](https://help.getzep.com/facts) 区分事实适用时间与系统记录/失效时间，并明确它们不证明事实真实。本项目采用显式时间与有限版本的原则，自行实现；没有引入其图数据库或自动时间推断。

本批没有宣称线上模型质量、完整跨平台兼容或完整事件溯源。具体本地验收与限制见 [0.8 复核](0.8-AUDIT.md)。
