# 升级到 1.0

1.0 使用快照 schema 5，支持迁移 schema 1、2、3、4。GitHub 源码和 npm registry 是独立发布渠道；先确认实际安装版本，再升级。

## 升级步骤

1. 停止所有会写入同一份快照的旧进程，备份原数据及旧代码/包版本。
2. 使用相同 persona、scope、tagScope 打开备份副本，核对档案、通用记忆和时间记录。
3. 构造/加载成功后才调用 flush 或 persist 保存新格式；保留升级前的独立备份。
4. 再切换正式应用。损坏、歧义或未知格式会明确失败，原文件保留，不用空状态覆盖。

旧 schema 1 使用默认 user 共享标签语义。切换 tagScope 或 scope 需要明确搬运，不能静默把共享标签复制到每个频道。没有 scope 时保留旧 persona 文件命名；非空 scope 使用 scope 与 persona 的组合摘要。

schema 1/2 的通用记忆与候选从空集合开始；schema 3 的即时替代数据迁移到显式时间区间；schema 4 保留时间语义并增加空候选池。schema 5 包含独立 candidates，宿主经验的确认元数据在此格式中保留。

## 调用行为

- buildBlock/buildContext 是纯预览。只有真实模型调用成功使用后才 confirmContext/confirmContexts，再保存。旧代码若依赖查看时增加计数，需要调整。
- 机器人自己的消息忽略。默认不对旁观消息计算社交分；需要旧行为可显式设置 scoreAmbient=true。
- talkDailyCap/perMessageCap 生效；每日额度默认 UTC，需要中国自然日可配置 Asia/Shanghai。
- 维护使用独立衰减锚点。旧实现已经覆盖的真实互动时间无法反推出丢失的历史。
- 同一字段更新需要 replaceId，可附 expectedRevision。status=current 是版本头，实际生效值按 validFrom/validUntil 选择。
- 文件写入通过独占锁和内容修订拒绝冲突。ERR_STORE_CONFLICT 需先处理本地变化，再明确 reload 或重试；不自动合并或抢锁。
- 自定义异步存储用 PersonaMemory.open/persist/reload；flush 对纯异步存储会明确报错。内存修改和持久化提交是两个阶段。

详见 [API](API.md)、[时间/存储](time-storage.md) 和 [受控学习](learning.md)。

## 状态与内容校验

- 上下文计入完整标签及 advice，同一预算可能容纳更少条目。存在状态建议时省略可能冲突的通用关系语气。
- support 预设默认关闭通用社交词表和关系语气，业务状态与建议由应用明确设置。
- 陈旧标签不会凭旧使用次数反复晋升；没有新证据时会降级并过期。
- setTag/advice 必须为字符串且不超过 2000 个 UTF-16 代码单元。坏数据需在独立副本中由宿主明确整理，不静默截断。
- 词法规则对明确第三方、疑问、条件和否定保守处理；不提供任意指代、时间或业务真实性推断。
- 完整 import 和异步 reload 限制全部编码字节、32 层、2,000,000 节点，不执行 getter/toJSON。值另有更小的单条上限。
- 磁盘与 HTTP/MCP/CLI 拒绝非法 UTF-8；快照路径须为普通文件，拒绝符号链接、设备与 FIFO。
- HTTP 的 Host 必须匹配回环地址和实际端口；反向代理需设置正确后端 Host。MCP 输出阻塞时暂停后续处理。
- Node --permission 下 fsync 被禁用，内置 JSON 保存会明确拒绝；不会跳过刷盘冒充成功。

## 回退与数据搬运

旧写者会拒绝 schema 5。回退需恢复旧代码和升级前快照，不能只修改 schemaVersion 或把新文件交给旧代码写。

getMemoryAt 仅查询仍保留的历史片段；维护、删除和版本裁剪后的内容不能凭历史时间恢复。完整恢复用 export/import；跨主体搬运当前值用 exportMemories、previewMemoryImport、applyMemoryImport，必须明确映射主体和处理冲突。

本地确定性迁移、旧写者保护、异常退出与跨系统验证见 [加固记录](1.0-HARDENING.md)。它们不提供对任意历史坏文件、网络盘或断电场景的自动修复保证。
