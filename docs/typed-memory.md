# 通用记忆：主体、类型与保存规则

当前本地 0.9 / 1.0 候选已采用 schema 5；候选审阅、经验和旧格式迁移见 [受控学习](learning.md)。下文内部批次记录不代表已经发布。

当前本地 0.8 已采用 schema 4 和显式生效区间；本页早期 schema 3 叙述保留为开发历史，最新兼容/存储约定以 [时间与存储](time-storage.md) 为准。

状态：本地 1.0 开发中的 0.6 批次，尚未发布；包版本暂留既有 0.4.0。GitHub/npm 上的旧版本不包含这里的新接口。

通用记忆独立于关系档案。保存项目事实不会创建用户档案，也不改变亲疏分数。当前由调用方明确写入，不自动从任意对话中抽取；本地 0.7 已加入按问题检索与预算上下文，见 [检索说明](retrieval.md)。

## 开始使用

```js
import {PersonaMemory} from 'persona-memory';

const pm=new PersonaMemory({scope:'my-app'});
const project={type:'project',id:'project-a'};

const first=pm.putMemory({
  id:'release-requirement-1', // 可选；稳定的调用方 ID 可用于安全重试
  subject:project,
  kind:'constraint',
  key:'release',
  value:{version:'1.0',requires:['tests','migration']},
  source:'user',
  evidenceId:'explicit-instruction-1',
});

console.log(pm.getMemory(first.id));
console.log(pm.listMemories({subject:project,kind:'constraint'}));
```

用户、项目和任务都使用同一接口。可运行 npm run example:memory，同时查看个人偏好、项目要求和学习计划。

## 主体与作用域

subject 的 type 为 user、project 或 task，id 是调用方明确给出的标识；可选 chatId 表示更窄的会话范围。三个字段共同确定主体。不同 type 的相同 id 是不同主体。

实例原有的 persona/scope 隔离继续生效。库不猜测跨平台身份，也不根据内容自动把两个项目合并。通用记录的 chatId 由调用方显式选择，不受标签 tagScope 配置隐式改变。

listMemories 必须指定一个完整 subject。未指定 chatId 代表该主体在当前实例中的共享记录，查询不会自动混入带 chatId 的记录；反过来同样如此。

## 类型与默认寿命

| kind | 内容 | 默认寿命 |
|---|---|---|
| preference | 明确偏好，如语言、格式 | 保留到替换或删除 |
| fact | 有来源的事实陈述 | 保留到替换或删除 |
| constraint | 项目/任务约束 | 保留到替换或删除 |
| decision | 已作出的决定 | 保留到替换或删除 |
| episode | 一次经历的背景、尝试、结果 | 90 天 |
| state | 当前临时状态 | 48 小时 |

expiresAt 可以逐条覆盖默认值；null 表示不按时间过期，数值表示毫秒时间戳。stateMemoryTtlHours、episodeMemoryTtlDays 调整对应默认寿命，允许 0。不得写入早于本次创建时间的截止时间。

长期记录不会因为没有被模型使用而消失；也不会因为被反复查看就变得更真实。source 是出处，不是事实真伪判断；model 来源同样需要调用方负责验证。

## 内容边界

value 允许 null、布尔、有限数字、字符串、数组和普通 JSON 对象。false、0、空字符串会被保留。

单条值最多 16 KiB、1024 个节点、8 层嵌套；单个数组/对象最多 128 项、字符串最多 8192 个 UTF-16 代码单元。函数、日期对象、BigInt、NaN、Infinity、循环引用、稀疏数组、getter、undefined 和原型污染字段会被拒绝，而非被悄悄序列化成别的内容。

subject/key/id/evidenceId 为非空字符串，最多 256 个 UTF-16 代码单元。记录来源 source 支持 manual、user、host、rule、model、import；默认 manual。

## 明确替换与安全重试

同一 subject+kind+key 只能有一个 current 记录。仍有效的记录不会被新写入静默覆盖：

```js
const second=pm.putMemory({
  subject:project,kind:'constraint',key:'release',
  replaceId:first.id,
  value:{version:'1.0',requires:['tests','migration','clean-install']},
  source:'user',
});
```

新记录有新的 id，并引用 supersedes；旧记录标记为 superseded，记录 supersededBy，仍保留原值与来源。跨主体、跨类型、跨字段或针对过时版本的替换返回 ERR_MEMORY_CONFLICT，不改变状态。

提供相同 id 重试相同内容会返回已有记录，不延长寿命，不增加修订或历史。相同 id 对应不同内容时明确冲突。重试已经被替换的旧 id 也不会重新激活旧值。没有提供 id 的重复新建会产生新 ID，因此对当前字段仍需明确 replaceId。

已过期但尚未清理的临时记录可以被同字段新观察取代；同样保留替代关系。更新时钟不能早于旧记录的最后更新时间。

已清理的 ID 只要仍被保留版本引用，就不能重新绑定到其他内容，返回 ERR_MEMORY_CONFLICT。忘记整个逻辑字段后，这些引用一起消失，才释放编号。对象键使用与运行环境语言无关的确定顺序；不同 Unicode 键不会因排序时被视作相等而误报重试冲突。

幂等保证以仍保留的记录为边界，不是永久的操作日志。ID 记录及其引用均消失后，不再保留对应的去重信息；重试应有明确期限，新观察使用新的唯一 ID。

这是显式替代的基础，不是自然语言冲突识别、未来生效计划或历史时间查询；后续 0.8 再补这些能力。现阶段不要用 now 参数模拟完整 as-of 查询。

## 查询与删除

getMemory(id,{includeInactive?,now?}) 默认隐藏过期、被替代或相对 now 尚未创建的记录。includeInactive=true 可按 ID 检查原值。

listMemories({subject,kind?,key?,limit?,includeInactive?,now?}) 支持明确类型/字段过滤，默认最多 50 条，最大 1000 条。按创建时间、新修订和 ID 确定顺序。返回值都与内部引用分离，不会因修改查询结果而改写存储。

forgetMemory(id) 会删除可由该 ID 识别的 subject+kind+key 的所有保留版本及对应变化摘要，不让旧值重新出现。记录本身已过期清理，但仍被相邻版本引用时，也能识别这个逻辑字段。

如果 ID 及其所有直接引用都已被清理，返回 removed=0，不猜测它属于哪个字段。若要按已知逻辑字段清理历史，先 listMemories({subject,kind,key,includeInactive:true,limit:1})，再对返回的任一保留版本调用 forgetMemory。deleteSubject(subject) 删除这个完整主体的所有通用记录，不猜测关联主体，也不删除独立的关系档案。

deleteUser(userId) 同时删除该用户的旧关系数据和 type=user 的通用记录。指定 chatId 时，只删除该频道的通用记录，保留未指定频道的共享记录。其他项目/任务即使同名也不受影响；任意 JSON 内容中的个人信息引用需由宿主按其数据模型管理。

clear() 清空当前实例全部关系数据与通用记忆。删除后需 flush 才落盘；外部备份和调用方另存的日志不在本库控制范围内。

## 维护与容量

maintain() 清理到期记录，并在返回值中增加 memoriesExpired。已被替代但未到期的版本暂留作有限容量内的检查，不自动变成当前值。

maxMemories 默认 10000、硬上限 100000，包含当前与保留的旧版本。满额明确抛 ERR_MEMORY_CAPACITY，不偷偷删除长期事实；需要忘记旧内容、维护到期项或明确提高上限后再写。替换保留一个新版本，也需要容量。

diagnostics().memories 给出总记录数。history({subject}) 可看对应变化摘要，不保存 value 原文。整份快照仍受 maxSnapshotBytes 限制，超限写入保留上一个有效文件。

## 数据兼容

新快照为 schemaVersion=3，包含 memories。加载 schema 1/2 时通用记录从空集合开始，原关系数据依照既有迁移规则保留；不会猜测旧标签应该转换成哪种事实。

schema 3 完整校验内容、当前字段唯一性、替代关系和容量后才替换内存。缺失的历史节点可以是正常过期，但它的所有保留引用必须指向同一字段、修订和前后关系；互相矛盾的引用会拒绝。记录集合的 getter、隐藏条目和 Symbol 键会拒绝，不通过序列化静默丢弃。无效导入不修改现有状态。旧代码拒绝 schema 3，避免只认识关系数据的实现忽略新记录后写回造成丢失。

升级前备份，回滚使用升级前快照；不要让旧实现写新文件。仍只支持单进程写文件；可替换存储和并发修订管理留在后续批次。

本地 0.7 已提供通用模型桥、HTTP 通用记忆读写与 MCP 读取工具；HTTP 写入仍须显式开启管理权限，模型抽取/学习尚未实现。旧的关系框架桥保持原定位，详见 retrieval.md。不能把此批次当作全部 0.6–0.9 已经实现。


## 0.8 时间语义更新

当前快照已使用 schema 4。原来的 status=current 现在明确表示最新提交版本头；默认读取和检索按生效区间选择，未来版本不会提前覆盖旧值。新增 validFrom/validUntil、expectedRevision、有限版本保留与异步存储。历史仅保留可用片段，不能保证永久去重或完整时间回放。见 [时间与存储](time-storage.md)。
