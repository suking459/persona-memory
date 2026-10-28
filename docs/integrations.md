# 接入验证与限制

## 本地验证

| 接入 | 开发验证版本 | 验证内容 | 尚未验证 |
|---|---|---|---|
| 核心、HTTP、MCP | Node 24.16.0 | 消息语义、预览、确认、HTTP 请求与协议处理 | 完整矩阵以 GitHub CI 记录为准 |
| Discord | discord.js 14.27.0 | 消息形状、@、回复、机器人过滤的离线用例 | 真实登录、权限和断线重连 |
| LangChain | @langchain/core 1.3.1 | 真实 Runnable 接收关系上下文 | 外部模型 API 与所有框架版本 |
| LlamaIndex TS | @llamaindex/core 0.6.23 | 真实 Memory.add/get 及上下文组合 | 外部模型与后续替代框架 |

@llamaindex/core 0.6.23 及其环境包安装时被 npm 标记为 deprecated。桥接保留为可选历史兼容能力，不成为主库运行时依赖，也不宣称支持全部未来 LlamaIndex 版本。

## Discord

本地设置 DISCORD_TOKEN，运行 npm run example:discord。示例需安装开发依赖或自行安装 discord.js。

普通群消息内容读取涉及 Message Content 特权意图及其例外，必须按平台规则配置。私聊、频道、@、回复和机器人消息分别处理；解析器本身不做网络请求。示例输出关系文本，没有调用模型，因此不增加模型上下文使用计数。

官方资料：https://docs.discord.com/developers/events/gateway#message-content-intent

## LangChain

现代 Runnable 链不会因为 invoke 时传了 configurable.memory 就自动调用任意 BaseMemory 形状对象。本项目提供 createLangChainBridge，由宿主显式接入 RunnableLambda，再把 persona_memory 放进模板。

examples/langchain.js 使用真实 Runnable 和无网络的模型边界替身，能验证上下文确实到达调用位置。旧 createLangChainMemory 形状保留，但需宿主实际调用 loadMemoryVariables/saveContext；不再把同一句话归给全部参与者。

## LlamaIndex

JS/TS 与 Python 是两条接口路线，不能用 Python 的 get/put 说明代替 TS 兼容性。createLlamaIndexBridge 组合 TS Memory.add/get 和关系资料，不假装是完整 Memory 替代品。examples/llamaindex.js 使用真实 Memory，但回复仍是无网络替身。

Python 应先通过 HTTP 调用同一核心，避免复制关系算法。

TS 官方参考：https://developers.llamaindex.ai/typescript/framework-api-reference/classes/memory/

## 运行要求

核心仅使用 Node 内置模块，面向 Node 18+。可选 LangChain 开发验证依赖要求 Node 20+，不等于核心新增了运行时依赖。本机开发基线为 Node 24；CI 覆盖 Node 18 核心及 Node 20/22/24 在 Windows、Linux 上的完整集成，实际结果见 GitHub 检查记录。

## 故障降级

模型调用前读取关系层失败，可以记录宿主侧错误并使用空关系文本继续；存储损坏需保留原文件并提示恢复，不使用空状态覆盖它。模型调用失败时不要伪造成功确认；后续重试需要稳定的消息 ID 和唯一轮次 ID。

## 桥接重试范围

同一桥接实例内保留最多 128 个轮次的重试状态；并发或重复的成功轮次复用结果，不再次调用模型。失败后可重试，LlamaIndex 已写入的用户消息不重复追加。外部服务自身的网络超时、幂等与框架历史持久化仍由宿主管理，不承诺跨进程的恰好一次执行。核心删除用户不自动删除外部框架历史或宿主缓存。

如果调用过程中标签被纠正或预览超过有效期，桥接仍返回已生成的回复，并在 usage 中明确报告 context-unavailable，不伪造使用计数，也不会因该统计失败无限卡住重试。

旧 LlamaIndex TS 包的声明额外引用 ajv；严格 TypeScript 示例已通过本项目显式的开发依赖补齐。它不进入核心 dependencies。
