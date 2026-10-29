# Changelog

## 本地 1.0 多环境加固（未发布）

- 有界、无 getter/toJSON 执行的快照导入，覆盖完整字节、深度和节点限制。
- 严格 UTF-8 与普通文件读取、增长文件读取上限、临时文件归属与异常退出恢复。
- 修复原型同名用户/访客/标签键和缺少自定义维度时的恢复；候选校验不占用正式容量。
- HTTP 校验本地 Host/实际端口；MCP 顺序处理与 stdout 背压，HTTP/MCP/CLI 拒绝坏编码。
- Windows/Ubuntu 的实际 Node 版本矩阵、离线安装、崩溃点与权限边界见 docs/1.0-HARDENING.md。未推送、未发布。

## 本地 0.9 / 1.0 候选开发（未发布）

- schema 5：独立候选池、期限、有限去重、基于原版本的接受/拒绝/修订和原子批量审阅。
- 可插拔抽取桥、限定主体/类型、取消/迟到保护、可选新字段接纳策略。
- 宿主报告的任务经验，独立结果确认、适用条件与纠错；CLI/HTTP/MCP 检查。
- 修复深入复核复现的 10 个复核失败用例（9 类问题）；真实旧 0.8 迁移和 Windows 多 Node 版本检查见 docs/0.9-AUDIT.md。

## 本地 0.8 开发（未发布）

- schema 4：明确生效/获知时间、未来计划切换、修订前置条件与默认 32 版本保留。
- 可插拔快照存储、内存/JSON 实现、冲突拒绝与显式异步 persist/reload。
- 主体映射的当前值导出、差异预览、原子导入；HTTP/MCP 时间读取与异步模型桥。
- 强化残缺历史校验、预览字节限制和删除清理。详见 docs/0.8-AUDIT.md。

## Unreleased — local 1.0 development

- Add scoped, explainable lexical retrieval with filters, explicit work limits and optional host-supplied relevance data.
- Render full typed records under character/token budgets; atomically acknowledge overlapping record and relationship contexts without refreshing factual evidence.
- Add a model-agnostic bridge, read-only MCP record tools, opt-in HTTP management, cross-application fixtures and bounded lifecycle replay.
- Harden final token budgets, literal version queries, request identity snapshots, stream completion checks and confirmation metadata limits during the 0.7 audit.

- Fix Unicode-key retry ordering, reuse of IDs still referenced after expiry, and forgetting a pruned ID through retained version links.
- Reject accessor/hidden/symbolic snapshot entries and inconsistent dangling version references; add expiry/retry/deletion regressions and disk write/rename failure recovery checks.

- Add typed user/project/task memories, independent retention, bounded JSON values, explicit replacement and stable-ID retry semantics.
- Read schemas 1/2 and persist schema 3 so old writers cannot silently drop new memory records. Add structured deletion and a runnable personal/project/learning example.

- Prevent stale tags from cycling between short and long term indefinitely; retain actual evidence time and allow advice corrections.
- Enforce profile limits for host events; stop LlamaIndex after a late history read exceeds its deadline.
- Include complete state guidance in prompt budgets and suppress conflicting generic tone; support presets omit social tiers through affinityContext=false and disable the default social tag lexicons.
- Reject oversized or invalid advice atomically for manual updates and snapshot imports.
- Expand conservative text-evidence checks and grouped synthetic evaluation; verify a real 0.3-generated synthetic snapshot plus continuous support/NPC scenarios.

No intermediate source push, tag, Release or package publication is triggered by this work.

## 0.4.0 — 2026-10-29

### Relationship state
- Explainable context previews and explicit, idempotent usage confirmation.
- Evidence provenance, host corrections, tag removal, and optional familiarity/trust dimensions.
- Application scope and channel-scoped tags, user deletion, bounded retention and diagnostics.

### Correctness and execution bounds
- Honor interaction flags, per-message caps, daily direct-message limits and an independent decay anchor.
- Linear quote masking, bounded literal matching and immutable lifecycle reduction.
- Bounded bridge deadlines with cancellation signals; late results cannot acknowledge context.
- Input, profile and snapshot limits; oversized snapshots do not replace the last valid file.
- Preserve and validate 0.3 snapshots with explicit migration boundaries.

### Integrations and examples
- Discord parser and rule-based bot example; offline verification only.
- Real LangChain Runnable and optional historical LlamaIndex TS Memory integration.
- Support and NPC demos, four presets, cookbook and tuning guidance.

### Validation
- Local behavioral, external-watchdog, randomized replay, strict typing and package-install checks.
- All seven pre-merge CI jobs passed: Node 18 core and Node 20/22/24 integrations on Windows and Linux. [Run](https://github.com/suking459/persona-memory/actions/runs/40737573004).
- No claim of live Discord validation, production memory accuracy, or LLM response-quality improvement.

npm publication is separate from the GitHub source update.

## 0.3.0
Visitor-only tracking, tag promotion adjustment and long-term tag freshness rules.
