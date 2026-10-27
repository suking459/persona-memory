# 推广文案

> 三个平台三套写法。核心策略：**别卖功能，挑争议**。
> "我做了个记忆库"没人点，"为什么 mem0 解决不了这件事"才有人吵。

---

## 一、Reddit · r/LocalLLaMA

**标题**（选一个）：

1. `mem0 stores facts. But it can't tell you whether to be polite today.`
2. `Everyone builds memory that remembers. Nobody builds memory that forgets.`
3. `I built a memory layer where affinity decays, tags expire, and it calls zero LLMs`

**正文**：

```
Every memory library I've tried answers one question: "what did this user say?"

None of them answer: "how far along are we?"

That's a different problem, and it shows up the moment you run an agent in a group chat
for a few weeks. Some people have talked to it forty times. Some insulted it once and left.
Mem0 happily stores all of it as flat facts and hands you the same block regardless.

So I built the other half.

**Affinity** has 5 tiers, a daily gain cap (30), and decays 2/day back to baseline.
Positive points are capped so a chatterbox can't grind to max in one night. Negative has
no floor. You can't farm friendship.

**Tags** have a 48h TTL. Re-hitting extends, doesn't reset. After 6 injections + 3 days
alive + 2 hits, a tag gets promoted to long-term. "Recently job hunting" should expire.
"He always says 确实" shouldn't.

**Style** is pure local rules — message length, question rate, emoji rate, night activity,
catchphrase sliding window. Zero LLM calls. I'm not paying tokens to learn that someone
uses a lot of emoji.

**Prompt budget**: max 4 people / 700 chars per injection, sorted by affinity, truncated.
Multi-user agents need this or the prompt explodes.

Zero runtime deps, 8 tests, MIT, ~15KB.

GitHub: https://github.com/suking459/persona-memory

It's NOT a mem0 replacement. Those store facts, this stores relationship state. They
compose fine — put both blocks in the same prompt.

Genuinely curious what people think about the numbers (daily cap 30, decay 2/day,
48h tag TTL). Those are guesses from running this in a QQ group for months, not science.
```

**要点**：承认数值是拍的，比假装严谨更容易引真讨论。

---

## 二、V2EX · 分享创造节点

**标题**：

```
[分享] 群聊机器人跑久了会遇到的记忆问题：怎么让好感度会掉、状态会过期
```

**正文**：

```
起因是在自己家群里跑了几个月的 QQ 机器人，遇到的不是"记不住"，是"记得太死"。

举个具体的：

半年前有人说过一句"最近在找工作"。这话被存下来了，半年后机器人还在拿它当上下文。
还有人某天心情不好骂了一句，之后每次互动系统都当"关系一般"处理，因为它是累计分。

于是我发现两件事：

1. 状态需要过期机制。但"他爱说确实"这种习惯不该过期。
2. 好感度需要衰减和上限。不然话痨一晚上就刷满，而真正常聊的人反而拉不开差距。

做了一套规则层的处理，纯本地的，不调模型：

- 好感度：5 档（生疏到很铁），每天涨分上限 30，每天回落 2 分，单条 ±8 封顶。夸、骂、@、引用、拍一拍各有分值。
- 标签：48 小时过期，重复命中是"顺延"不是"重置"。注入过 6 轮 + 存活 3 天 + 命中 2 次 → 晋升长期标签。每人上限 16 个。
- 说话风格：长度、问句率、表情率、夜间活跃率、口头禅滑窗，全是本地统计，不烧 token。
- 提示词预算：最多 4 个人 / 700 字，按好感度排序截断。

代码抽出来了，零依赖，8 个测试：
https://github.com/suking459/persona-memory

想讨论的是那套数值（30 分上限、2 分衰减、48 小时）——这些是我拍脑袋定的，
跑下来感觉还行，但没什么理论依据。有做过类似东西的朋友欢迎说说你们的参数。
```

**要点**：讲具体场景，不吹技术，主动暴露"数值是拍的"。

---

## 三、Twitter / X

```
Memory libraries answer "what did this user say".

None answer "how far along are we".

Built the other half:

→ affinity: 5 tiers, +30/day cap, -2/day decay
→ tags: 48h TTL, promote to long-term after 6 injections
→ style: local stats, zero LLM calls
→ prompt block: max 4 people / 700 chars

15KB, zero deps, MIT.

github.com/suking459/persona-memory
```

**要点**：短、有数字、结尾给链接。不要 hashtag 堆。

---

## 四、发的时候注意

1. **别自夸**："我做了个很厉害的东西"会被踩。发"我遇到个问题，这样做对不对"会有人回。
2. **主动认怂**：数值是拍的、MCP 只能发挥 30%、好感度是产品设计不是技术壁垒——这些写在前面，别人反而信你。
3. **别一次发所有平台**：先发 Reddit 或 V2EX 一个，看反应再调整文案。
4. **回复要快**：前两小时的评论决定帖子能不能起来。

## 五、可能的质疑和回答

**Q: 这不就是简单的加减分吗？**
A: 是。核心不是算法复杂度，是"哪些信息该过期、哪些该沉淀"的产品判断。加减分谁都会写，参数调对要跑几个月。

**Q: 为什么不用 LLM 抽取？**
A: 因为贵。一个群里 30 个人，每条消息调一次模型抽标签，成本比聊天本身还高。

**Q: 和 mem0 能不能一起用？**
A: 能，而且推荐。mem0 管事实，这个管关系，两个 block 拼进同一个提示词。

**Q: 好感度会不会让 AI 变得谄媚？**
A: 会，如果不设天花板。所以有每日上限和档位提示词（每个档位明确写了该用什么语气、不该答应什么）。
