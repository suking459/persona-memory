# 接入与日常管理

本地 1.5 候选，尚未发布到 npm。已有的 Codex CLI、DSH headless 实测范围见 [验收矩阵](AGENT-ACCEPTANCE.md)；本页介绍本批新增的包内管理入口，不把它等同于桌面 UI 已验收。[English](agent-operations.en.md)。

## 准备

使用当前本地源码或经核对的本地安装包。先选目标项目和独立接入包目录；prepare 不启用宿主，不保存模型凭据，不写记忆。示例路径须换成自己的真实目录，输出目录不能已存在。

~~~powershell
node tools/connect.mjs prepare --host codex --project D:/my-project --out D:/memory-codex --locale zh-CN
node tools/connect.mjs prepare --host dsh --project D:/my-project --out D:/memory-dsh --locale zh-CN
~~~

安装包使用 persona-memory-connect prepare，同样的参数。公开 npm 1.0.0 没有这批命令，不要用它代替本地候选。跨电脑移动须重新准备并按 [备份恢复](storage-backup.md) 保留逻辑身份，不能直接复制旧绝对路径配置。

接入包新含 README.md、OPERATIONS.md、owner.mjs，以及原有 binding.json、WORKFLOW.md、宿主配置和 manifest.json。OPERATIONS.md 根据宿主、当前操作系统和 locale 生成具体步骤；中英文说明已提供，其他 locale 回落英文，记忆原文不翻译。

## 启用

在接入包目录打开独立终端，先运行 node owner.mjs help 和 node owner.mjs doctor。后者只检查本地库，不能证明宿主已经连接；损坏时以失败退出并保留原文件。

Codex 包的 node owner.mjs enable 是显式写入操作：固定目标为所选项目的 .codex/config.toml，只追加本服务，保留原字节恢复记录；不修改全局配置或 AGENTS.md，不自动安装每轮钩子。已有同名声明会拒绝。关闭配置编辑者后执行，重新在受信任项目中打开宿主，查看 /mcp 并实际调用 memory_status。把 WORKFLOW.md 的流程交给宿主遵循；模型是否正确调用仍需检查实际结果。

DSH 包不提供自动 enable/disable。OPERATIONS.md 生成 dsh --profile headless --patch 的本次启动命令，并包含明确的只读状态任务。从目标项目目录运行，使用已经安装的 dsh 和宿主既有模型认证。此步骤会执行一次模型任务；Key 留在宿主设置中，不填入接入包。命令行使用的引号适用于 Windows PowerShell 或当前类 Unix shell，勿直接粘贴到 Windows cmd。桌面 profile 导入尚未验收，不提供推测的点击步骤。

## 候选、纠错、遗忘

在接入包目录运行：

~~~sh
node owner.mjs inspect --scope project --limit 20
node owner.mjs inspect --scope project --candidate ACTUAL_ID
node owner.mjs review --scope project --candidate ACTUAL_ID --revision 1 --decision accept
~~~

用当前真实 ID/revision 替换占位值，核对候选原文及证据来源后再接受；拒绝将 accept 改为 reject。若获准范围没有 project，改为 binding.json 中的实际别名。所有者入口省去了 --binding，不接受其他绑定重定向；这是减少误操作，不是同一用户下的系统权限隔离。不要让 capture Agent 用终端调用它绕过独立审阅。

更正由宿主提出同一 scope/kind/key 的新候选，再独立审阅。读取正式记忆会看到新值，不要求为了正常审阅重启服务。

遗忘先 explain 取得当前正式记录 ID/revision，再 forget-preview 核对连带历史、派生字段和候选，最后 forget-apply。备份、恢复和批量审阅沿用 [管理命令](owner-management.md)，只省去 --binding。OPERATIONS.md 已包含完整示例。预览不是批准；目标变化或预览过期时重新检查，不强制循环重试。遗忘不会撤回旧聊天上下文或外部备份中的副本。

## 停用与恢复

Codex 关闭当前会话后执行 node owner.mjs disable，再重开宿主。配置后来被编辑过就拒绝整份恢复，保留新编辑，人工核对恢复记录后合并。撤销包不能直接重复 enable；需要新的接入包显式复用原存储和逻辑身份。

DSH 停止本次 headless 进程，下次启动省去该 --patch。没有另行导入持久 profile 时不需要删除日常设置；若自行另行导入，须在宿主撤下对应条目，不能把上述步骤当作已经撤销。

停用不删除本项目记忆。重连同一绑定/存储可恢复正式记录；完整恢复会替换数据，必须先保留当前备份，再审查恢复预览。保持接入包、安装库和 Node 的原位置；路径改变时重新生成。不要通过删除数据文件修复错误。宿主原生记忆与权限始终独立。

主流产品配置参考：[Codex MCP 官方说明](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[DSH MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)。具体已测版本以验收矩阵为准。
