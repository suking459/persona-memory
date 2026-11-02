# persona-memory 1.5.0

面向用户、项目和任务的通用记忆库，中期能力整合。

## 升级前必读 / Breaking default changes

本版经所有者选择作为稳定版 1.5.0 发布，但默认关系策略存在不兼容变化：内置情绪/健康词表、固定亲疏口吻已移除；档位改为 band-0…band-4；关系判断由宿主明示，自定义规则与旧数据保留。不要假定 ^1.0.0 可无改动升级；固定版本，先备份并阅读 docs/1.5-POLICY-MIGRATION.md。schema 6 支持读取 1–5；回退使用升级前备份。

## 新能力

- 范围绑定的 Agent MCP、默认候选与独立审阅、运行中刷新、十一类配置生成；Codex CLI 与 DSH headless 指定 Windows 版本已有真实模型五场景验收，其余实验性。
- 派生来源指纹、纠错失效和连带遗忘、候选质量提示、多语言原文保存/检索。
- 可选语义检索与失败回退，可选原生 SQLite、CAS、全量校验备份、恢复预览与身份迁移。
- doctor、词法解释、批量审阅/删除影响预览，包内 owner.mjs 与中英日常操作说明。

## 来源与边界

由维护者需求驱动、AI 辅助实现。已知风险表达/词表移除，规则与标签生命周期按先行规格重写；144 个代码文件与 999 份固定快照比对、88 个生产文件矩阵，未确认当前仍保留独特第三方实现。有限核查不能证明全网原创或全部权利确权；真实历史、第三方组件许可和旧版本权利保留。详见 NOTICE.md 与 docs/1.5-ORIGIN-REVIEW.md。

Windows 六运行时、隔离模拟 Ubuntu 543 项与类型、双端同包离线安装已通过；公开 CI 和发布包另做复核。不宣称零 bug、所有宿主/桌面 UI、真实语义准确率或所有平台已验证。核心零运行时依赖，无默认模型调用。

Install: npm install persona-memory@1.5.0

New setup/operations: docs/agent-operations.md / docs/agent-operations.en.md.
