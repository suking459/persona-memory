# 参数与调参指南

这些是应用规则，不是经过普遍验证的人际关系定律。先使用场景预设，观察样例和实际数据，再调整。

## 预设

createPreset('community'|'companion'|'support'|'npc', overrides)

- community：频道隔离，最多 4 人，每日增长上限 20，适合群聊。
- companion：用户共享，默认一人，可选熟悉程度与信任维度。
- support：频道隔离、关系分日增长为 0，不用关系分决定服务资格；处理状态由宿主设置。
- npc：频道隔离，熟悉程度与信任分离，状态 TTL 72 小时。

## 参数表

| 参数 | 默认 | 行为与注意 |
|---|---|---|
| dailyGainCap | 30 | 关系分每日正向变化额度，0 禁止正向增长 |
| talkDailyCap | 12 | 每日普通直接互动计分次数；@、引用等有自己的分值 |
| perMessageCap | 8 | 单条正负变化上限，0 禁止分数变化 |
| decayPerDay | 2 | 每天向 baseline 回落的数量，可按部分天增量计算 |
| decayBaseline | 0 | 0–100，衰减不越过基线；不是最低可扣到的分数 |
| attentionWindowSec | 180 | 明确 @/回复/私聊后的续聊窗口；0 不开启后续时间窗口 |
| botId | null | 实际平台机器人 ID，和 persona 无关 |
| scoreAmbient | false | false 避免旁观消息的夸奖/辱骂影响与机器人的关系 |
| tagTtlHours | 48 | 短期状态寿命，重复命中顺延 |
| longTermTtlDays | 7 | 长期状态无新证据后的降级时间 |
| maxInjections | 200 | 尚未晋升的短期状态达到此使用次数后在维护中移除 |
| maxTagsPerPerson | 16 | 单作用域状态数上限，过量优先清理旧的短期状态 |
| tagScope | user | user 跨频道共享；chat 每频道隔离；更改存储语义需显式迁移 |
| timeZone | UTC | 每日额度重置所用时区，例如 Asia/Shanghai；夜间风格统计暂用运行环境时区 |
| maxPeople | 4 | 上下文最多人数，包含访客；0 不选择任何人 |
| maxChars | 700 | 上下文 Unicode 字符预算，0 输出空文本；不是 token 预算 |
| visitorTracking | true | 没实质互动的新用户仅记访客；false 时仍会建立普通档案 |
| visitorHint | true | 是否把达到次数门槛的访客写进上下文 |
| visitorHintMinCount | 2 | 访客提示最低次数 |
| maxVisitors | 10000 | maintain 后的访客数量上限 |
| visitorRetentionDays | 90 | maintain 清理多久未再出现的访客 |
| maxStyleFragments | 512 | 单人风格片段计数表上限；不是完整聊天记录 |
| dedupeLimit | 2000 | 消息和轮次去重保留上限；0 关闭保留，不承诺去重 |
| dedupeDays | 7 | 去重记录时间窗口 |
| historyLimit | 100 | 最近变化摘要上限；0 不记录历史 |
| blockWords | [] | 屏蔽风格片段 |
| extraRules | {} | 同名规则替换默认规则；空 words 可禁用一个默认标签 |
| dimensions | {} | 维度 min/max/baseline/decayPerDay；信任仅由宿主事件更新 |

## 三个容易误解的地方

1. 分数始终限制在 0–100。“负向变化没有每日额度”不是“总分无限为负”。
2. 默认不为所有群消息加 1；普通直接互动和旁观消息有区别。适配器需正确传递直接互动标志。
3. 标签进入提示词的次数是使用记录，不是新证据。面板查看不计数，重复确认按 turnId 去重。

可选 countTokens 与 tokenBudget 放在 buildContext 调用中，避免给核心添加分词依赖。不同模型使用不同 tokenizer，调用者负责提供正确回调。

## 调参方法

先保留固定的合成输入和时间推进脚本，再一次改一类参数。比较状态误判、过期是否合理、上下文占用与处理耗时。规则演示的文案变化不能替代真实用户体验或模型对照。

## 资源边界与执行时限

maxProfiles 默认 10000，完整档案满额时抛 ERR_MEMORY_CAPACITY，不静默删除；maxVisitors 默认 10000，满额优先保留最近来访者。maxSnapshotBytes 默认 64 MiB，在写入前检查，超限保留上一个有效文件。数量配置有明确硬上限，详见 src/limits.js。

额外词表最多 64 组、512 个关键词，每词最多 128 字符；空关键词拒绝。极端重复的否定匹配超过工作量预算会明确拒绝，需要调用方拆分消息。

桥接的 timeoutMs 默认 30000，范围 1–300000。回调第二参数提供 AbortSignal；支持取消的模型客户端应传递该信号。超时不自动重试，不把迟到结果计作成功使用。任意调用方同步无限循环仍需进程或 Worker 隔离。
