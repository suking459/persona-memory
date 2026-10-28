# 从已发布 0.3.0 迁移

目标为 GitHub 源码 0.4.0，npm 发布独立处理。

1. 停止对同一个存储目录的并行写入，备份关系文件。
2. 以相同 persona、默认空 scope、tagScope=user 打开旧文件，核心校验并在内存迁移到 schemaVersion=2。
3. 验证档案后调用 flush；保留的原始备份由调用方管理。
4. 切换 tagScope 或 scope 需要明确迁移，不默默把跨频道标签复制到每个频道。

没有 scope 的文件仍使用原 persona.json 名称；非空 scope 使用组合摘要文件名，避免分隔符碰撞。损坏文件或未知 schema 抛错，不覆盖原文件。

## 行为变化

- buildBlock 改为纯预览。旧代码若依赖注入计数，需要改用 buildContext + confirmContext；无须计数时可继续 buildBlock。
- 机器人自己的消息完全忽略，不再改人的最后活动时间。
- 默认不从旁观夸奖/辱骂计算关系分；scoreAmbient=true 可选择旧行为。
- 普通直接互动可正确计分，talkDailyCap 与 perMessageCap 生效。
- 每日额度使用可配置时区，默认 UTC；需要中国自然日可设 Asia/Shanghai。
- 维护使用独立的衰减锚点，保留真实互动时间；旧的 lastInteractiveAt 在已发布版本中可能已被维护覆盖，无法反推出丢失的历史时间。
- 类型区分 RawStyle（内部统计输入）和 StyleProfile（摘要输出），修复之前的形状不一致。
- HTTP/框架接入保留实际发送者与显式标志，不把一条消息复制成多人的发言。

## 回滚

代码改造前的源码与文档备份位于本项目 .local-backup/20261029-before-milestone。它不包含 .git、node_modules、QQA 或原始聊天数据，也不进入发布包。

不要把 schemaVersion=2 文件交给旧代码直接写。回滚需要恢复旧代码，并使用迁移前的数据备份。恢复前先停止本项目自己的写入进程；不需要停止或修改 QQA。

源码更新与 npm 发包分别进行。公开变化见 CHANGELOG.md；本机验证记录见本地 DEVELOPMENT.md。
