# 多语言兼容：1.1 开发批次

状态：本地 1.1.0-dev.0，尚未发布。npm / GitHub 已发布的 1.0.0 不包含本批新接口。英文入口：[English guide](agent-integration.en.md)。

## 目前能做什么

原有库可保存 Unicode，但旧规则、部分检索和展示偏中文，不能据此称为完整全球语言适配。本批以宿主抽取＋候选审阅的通用记忆路径为基础，增加：

- 记忆值、证据及 Unicode 主体按原文保存；读取、导出、落盘和重启不自动翻译或重写内容。
- 检索支持显式 BCP 47 locale，例如 en、zh-CN、ja、ar、hi、th、tr；语种和地区不是访问权限。
- 匹配时采用 NFC，并按指定 locale 处理大小写；不改变已保存原文。保留附加符号和词内连接符，避免把印地语、孟加拉语词语拆成造成误命中的单字母。
- 泰语、老挝语、高棉语、缅甸语使用运行时 Intl.Segmenter 的词典分词；中文/日文仍使用原有有上限的字符与双字匹配，其他文本采用词和标识符匹配。
- 新 Agent 包默认 locale=en；--locale zh-CN 生成中文工作流、接入说明和 WorkBuddy 名称。其他语言的资料可正常保存和搜索，人工说明暂回退英文。
- memory_recall / memory_context 可单次覆盖查询 locale；切换语言不改变主体、namespace、读写权限或候选审阅要求。
- 模型工作流要求保留来源语言、用用户当前语言回复。能否准确理解和抽取，仍取决于所接宿主及模型；不是本库内置翻译模型。

## 使用方式

在当前本地开发源码中：

```powershell
node tools/connect.mjs prepare --host workbuddy --project D:/my-project --out D:/memory-workbuddy --locale zh-CN
```

--project 为已有项目目录，--out 为尚不存在的新目录。准备只生成文件；按 [接入说明](agent-integration.md) 启用，不会自动改宿主配置。

新 Agent 默认英文，旧 binding 没有 locale 也可加载并使用英文默认。查询为另一种语言时，宿主可传：

```json
{"scope":"project","query":"istanbul","locale":"tr"}
```

SDK 使用：

```js
const result = pm.searchMemories({
  subject: {type: 'project', id: 'work'},
  query: 'กาแฟ',
  locale: 'th'
});
const context = pm.buildMemoryContext({
  subject: {type: 'project', id: 'work'},
  query: '咖啡',
  locale: 'zh-CN',
  budget: 2000
});
```

通用模型桥、原 MCP 有类型记录工具和 HTTP 查询沿用同一 locale。SDK 不传 locale 时保留旧的大小写处理、停用词策略和中文上下文标题；新 Agent 显式采用默认英文。没有从聊天内容自动猜测 locale，避免混合语种时暗改查询规则。

## 验证与实际限制

合成样例覆盖 en、zh-CN、ja、ko、fr、es、de、pt、ru、ar、he、hi、bn、th、lo、km、my、tr、vi、id、ta、te、fa、sw、uk、pl 共 26 个语言标记。它们检查原文一致性、范围内字面召回、持久化和恢复，不是 26 种语言的人工质量评测，更不是“全球所有语言均已认证”。

本批回归另覆盖：泰语无空格检索、印地语/孟加拉语附加符号误召回、土耳其语大小写及停用词、NFC/NFD、阿拉伯文与 emoji 混排、双向控制符安全输出、语言切换不越权、实际 stdio 提案→所有者审阅→新进程重读、完整字符预算。

- 当前是字面检索，不自动把英文 coffee 与法文 café 当作同一语义。跨语言、同义改写、词形变化和翻译质量评估安排在 1.3，可选语义服务不强绑核心。
- 附加符号不是一律忽略；带与不带变音/声调/元音符号的词可能不匹配。没有承诺所有语言的词干、形态分析或拼写纠错。
- Segmenter 依赖 Node 的 ICU 数据；版本/裁剪构建可能影响边界。缺少该能力时明确报错，不假装已经正确分词。本批所列运行时实测不代表任意自定义 Node 构建。
- 字符预算按 Unicode 码点计算，不是可见字形数或模型 token；tokenBudget 仍需宿主提供实际 tokenizer。
- 旧关系自动规则/预设和网页示例仍偏中文；它们不是本批全球语言抽取方案。版权来源和声明照旧，不因改用新路径自动清除。
- 中英使用文档及生成说明先行。CLI/协议字段和错误文本仍主要英文；其他 UI 翻译、无障碍、RTL 视觉布局及真实母语者质量评估尚未完成。
- 各厂商宿主真实端到端仍须逐项实测；协议、配置和库测试不等于宿主已正式支持。
- 语言兼容不等于各国的法律、数据驻留或商业服务可用性认证。

运行 npm run test:multilingual；本批详细证据见 [复核记录](1.1-MULTILINGUAL-BATCH.md)。

## 后续要求

多语言作为 1.1–1.9 的横向验收，不另开一轮大重构。1.1 先稳住原文、检索及中英入口；1.2 验证不同语言的候选/纠错；1.3 加语言分组与跨语言语义评估；1.4 验证非 ASCII 路径和迁移；1.5 中期发布前补英文安装排错和实际宿主语言流程；之后的交接、共享、经验和成本统计也必须复用相同约束。发布仍遵守 1.5 可选中期、2.0 完整交付的安排。

后续运行中审阅衔接批次已重新完成包含全部 41 项多语言检查的 Ubuntu 24.04.5 / Node 26.13.0 软件模拟完整套件，见 [当前复核](1.1-REVIEW-FLOW-BATCH.md)。其他系统/语言质量仍按前述边界，不由该结果推导。
