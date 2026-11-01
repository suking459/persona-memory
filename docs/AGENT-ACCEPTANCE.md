# Agent 验收状态

日期：2026-11-01；针对本地 1.5 候选。以下按具体入口、版本和测试层次记录，不把配置生成或协议检查当作真实模型会话。

| 工具 | 实测环境/入口 | 原生客户端 | 真实模型会话 | 未覆盖 |
|---|---|---|---|---|
| Codex | Windows x64，CLI 0.166.0-alpha.5.1 | 已通过真实 app-server 工具管线 | 五个场景通过，使用现有账号与 CLI 默认模型 | Codex 桌面 UI，以及其他系统/版本的宿主会话 |
| DSH | Windows x64，headless 0.2.1-rc.5 | 已通过配置组合、工具注册和执行管线 | 五个场景通过，官方 DeepSeek API | DSH 桌面 UI，以及其他系统/版本的宿主会话 |
| WorkBuddy、Claude Code、Gemini CLI、Qwen Code、Kimi Code、CodeBuddy、iFlow、VS Code Copilot、Cursor | 已有相应配置生成 | 未在真实客户端验收 | 未验收 | 保留实验性接入，取得环境后逐项验证 |

不要求使用者为了本项目安装、登录或订阅所有产品。先验证已有且可用的工具，其余保持实验性标记。未列入清单的产品没有自动获得支持承诺。

## 已完成的 Codex CLI 真实模型场景

1. 模型实际调用 memory_status 与 memory_propose，候选保持 pending，不进入正式检索。
2. 独立所有者命令审阅后，另一个模型进程调用 memory_recall，读到原始日文值。
3. 模型提出西班牙文更正，保持待审；独立所有者接受。
4. 新进程、新模型会话读取更正后的正式记录。
5. 所有者预览并遗忘后，再开模型会话，实际调用检索并返回 EMPTY。

每一步以私有线协议日志中的真实工具调用、持久化快照和所有者命令结果交叉核对，不仅依据模型声称“已经保存”。测试用词条和证据编号均为合成内容；没有将用户真实偏好更改为测试语言。

## DSH

原生 headless 运行时已实际加载本项目生成的 Cordis 配置，注册八个 capture 模式记忆工具。通过版本内的工具执行管线验证候选不可见、独立审阅、即时更正、进程重启恢复、影响预览后的遗忘与拒绝越范围。

官方 API 驱动的真实模型也已完成上述五个场景；新进程读取与遗忘后的空结果均有实际 MCP 调用记录。

原生 fixture 在结果落盘后由测试控制器结束其独立进程树；该项不作为正常 UI 退出/热卸载的验收。原生日常 profile 保持独立。公开仓库当前文档与安装版本的内部工具执行 API 有差异，私有 fixture 按实测版本适配；本库对外仍使用标准 MCP，不依赖这些内部 API。

## 范围与凭据

测试配置、临时宿主目录、会话和合成记忆留在项目私有诊断目录；没有向日常 Codex/DSH 配置安装此服务，没有把其他项目或 QQ 聊天搬入测试。Codex 在独立目录由所有者登录，助手未复制原有登录缓存。DSH 官方 Key 仅通过本地隐藏输入传给测试进程，不通过聊天接收。

登录资料、完整调用记录、账户相关原始文件及本地配置不进入 Git/npm 包。测试结束已对独立 Codex 目录执行原生退出登录，并关闭专用登录/Key 输入窗口；没有遗留本项目的宿主测试进程，日常 DSH 进程继续运行。DSH 的十次子进程环境探测确认模型 Key 未传入记忆 MCP 服务，测试输出检查没有发现原始 Key 残留。清理与本地证据摘要单独保存，公开文档只记录版本、场景和结论。

配置生成器中的默认未验收标记仍保留：它描述使用者新生成、尚未在其自身环境运行的连接，也覆盖桌面入口，不能由本次指定 CLI 版本的通过结果推导为所有安装都已验收。

这些结果不证明恶意提示完全无效、所有模型均会正确选择工具、语义模型准确率或未知缺陷不存在。原有 Windows/Linux 库与安装验证继续有效；它们与这里的 Windows 宿主验证是不同范围。历史代码来源和版权收尾仍单独保留，不因宿主验收而自动解除。

参考：[OpenAI MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[OpenAI app-server 文档](https://learn.chatgpt.com/docs/app-server)、[DSH MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)、[DSH tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)。

本地证据名称：.artifacts/1.5-host-acceptance/codex-native-report.json、codex-model-report.json、dsh-native-report.json、dsh-model-report.json。这些私有文件不随发布包分发。
