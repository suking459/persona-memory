# 推广文案（已核实版）

> **发布前核实结论**：
> - 源码无第三方痕迹（grep copyright/license/author 全为误报）
> - GitHub 上**有**类似项目，最接近的是 `etherfunlab/eros-engine`（六轴好感度 + decay）
> - **不能说"首创"**，说"这个组合我没找到现成的"

---

## 零、发布前必须知道的三件事

发之前自己心里要有数，因为评论区一定会问：

### 1. `etherfunlab/eros-engine`（最接近，做得更深）

它有完整的 `affinity-model.md`：

```
六轴向量：warmth / patience / trust / intrigue / intimacy / tension
decay(Δt) = max(FLOOR, 1 − RATE·days)
tier drop 机制、life choice 联动
```

**比我们的单值模型精细得多。** 但它是：
- 完整引擎，不是可嵌入的库
- 依赖 LLM judge 打分（每次判定调模型）
- 绑在它自己的世界观里

### 2. `koishi-plugin-chatluna-affinity`（npm 0.3.15）

"ChatLuna Character 好感度系统，提供 {好感度}、{关系}、{黑名单} 变量"，**仅支持 onebot**。

### 3. `suis077/dsh-companion`

"DSH 插件：人设卡 + 跨会话记忆 + 好感度"，好感度是单一值（角色对用户），不支持多人。

### 所以我们的位置

**不是"第一个做好感度的"，是"第一个做成可嵌入、零 LLM、带预算的"**。

| | persona-memory | eros-engine | chatluna-affinity | dsh-companion |
|---|---|---|---|---|
| 多租户（每人每会话） | ✅ | ✅ | ❌ | ❌ |
| 零 LLM 成本 | ✅ | ❌ | ❌ | ❌ |
| 标签 48h 过期 | ✅ | ❌ | ❌ | ❌ |
| 提示词预算 | ✅ | ❌ | ❌ | ❌ |
| 精度 | 单值 | 六轴 | 单值 | 单值 |
| 可嵌入任意宿主 | ✅ | ❌ | ❌ | ❌ |

---

## 一、Reddit · r/LocalLLaMA

**标题**（选一个）：

1. `Memory that remembers is easy. Memory that forgets is the hard part.`
2. `I built the boring half of agent memory: decay, expiry, and a prompt budget`
3. `mem0 stores facts. It still can't tell you whether to be polite today.`

**正文**：

```
Every memory library answers "what did this user say". Almost none answer "how far
along are we".

That question shows up the moment you run an agent in a group chat for weeks. Some
people talked to it forty times. One person insulted it once and left. Mem0 stores
all of that as flat facts and hands you the same block regardless.

So I built the other half — but to be clear up front: I'm not the first person to
put numbers on this.

**Prior art (please read this before commenting):**

- `etherfunlab/eros-engine` has a six-axis affinity model (warmth/patience/trust/
  intrigue/intimacy/tension) with decay and tier drops. It's more sophisticated
  than mine.
- `koishi-plugin-chatluna-affinity` ships affinity + relationship vars for Koishi.
- `suis077/dsh-companion` does affinity inside the DSH harness.

All three are bound to a platform or a runtime. All three call an LLM somewhere in
the loop.

**What I actually built:** a library, not an engine.

→ affinity: 5 tiers, +30/day cap, −2/day decay, ±8 per message
→ tags: 48h TTL, re-hit extends, promote to long-term after 6 injections + 3 days
→ style: length / question rate / emoji / night / catchphrases — pure local rules,
   zero LLM calls
→ prompt block: max 4 people / 700 chars, sorted by affinity, truncated

Zero runtime deps, 15KB, 8 tests, MIT.

github.com/suking459/persona-memory

The part I'd actually argue is novel isn't the affinity math — it's the **tag
lifecycle** and the **prompt budget**. "Recently job hunting" should expire in 48
hours. "He always says 确实" should not. And multi-user agents need a hard cap on
how many relationship lines go into the prompt, or it eats your context window.

Numbers (30/day cap, 2/day decay, 48h TTL) are guesses from running this in a QQ
group for months. Genuinely interested if anyone has better ones.
```

**要点**：
- 第二段就主动列出 prior art，**抢在评论区之前说**
- 把"novel"限定在标签生命周期 + 预算，不吹好感度
- 承认参数是拍的

---

## 二、V2EX · 分享创造

**标题**：

```
[分享] 群机器人跑久了会遇到"记得太死"的问题：好感度该掉、状态该过期
```

**正文**：

```
先说清楚：好感度系统不新，GitHub 上已经有做得比我深的。

- etherfunlab/eros-engine 用六轴向量（warmth/patience/trust/intrigue/intimacy/tension），
  有 decay、有 tier drop，模型比我这套单值精细得多
- koishi-plugin-chatluna-affinity 给 Koishi 生态提供了好感度/关系变量
- suis077/dsh-companion 在 DSH 里做了人设卡 + 好感度

这三个我都看过。它们的共同点是：绑在某个平台或运行时里，而且循环里都要调模型。

我遇到的具体问题是另外两个：

**一、状态需要过期，但习惯不该过期**

半年前有人说过一句"最近在找工作"，这话被存下来，半年后机器人还拿它当上下文。
但"他爱说确实"这种习惯，聊久了就该沉淀。

所以做了标签的两级生命周期：48 小时过期，重复命中是顺延不是重来；注入过 6 轮 +
存活 3 天 + 命中 2 次，才晋升成长期标签。

**二、多人场景下提示词会被关系信息撑爆**

一个群三十个人，如果每个人都塞一段关系描述，上下文直接没了。

所以有硬预算：最多 4 人 / 700 字，按好感度排序截断。

**好感度这块我是单值模型**，比 eros-engine 粗糙，但好处是纯本地规则算，
不调模型——群里三十个人，每条消息调一次模型抽标签，成本比聊天本身还高。

代码抽成零依赖的库了：
https://github.com/suking459/persona-memory

想讨论的是那套数值（30 分日上限、2 分/天衰减、48 小时 TTL）——拍脑袋定的，
跑下来感觉还行，但没什么理论依据。做过类似东西的朋友欢迎说你们的参数。
```

---

## 三、Twitter / X

```
Every memory lib answers "what did this user say".
Almost none answer "how far along are we".

Not the first to try. eros-engine's six-axis affinity is deeper than mine.

What I did differently:
→ library, not engine (no platform lock-in)
→ zero LLM calls (pure local rules)
→ tags that expire in 48h
→ hard prompt budget: 4 people / 700 chars

15KB, 0 deps, MIT.
github.com/suking459/persona-memory
```

---

## 四、必答题（评论区一定会出现的）

**Q: 这和 eros-engine 什么区别？**

> 它更精细（六轴 vs 单值），但它是个引擎、要 LLM judge、绑自己的世界观。
> 我这个是能塞进任何宿主的库，纯规则、零成本。两者不冲突——想要精度用 eros，
> 想要轻量用这个。

**Q: 好感度不就是简单的加减分？**

> 是。核心不是算法复杂度，是"哪些信息该过期、哪些该沉淀"的产品判断。
> 加减分谁都会写，参数调对要跑几个月。

**Q: 为什么不学 eros 用 LLM 打分？**

> 因为贵。群里三十个人，每条消息调一次模型评估情绪，成本比聊天本身还高。
> 而且 LLM 打分不稳定——同一句话今天打 3 分明天打 5 分，关系就变成随机游走了。

**Q: 会不会让 AI 变得谄媚？**

> 会，如果不设上限。所以有每日涨分封顶 + 档位提示词（每个档位明确写了该用什么
> 语气、不该答应什么）。好感度高不等于有求必应。

**Q: 和 mem0 能一起用吗？**

> 能，而且推荐。mem0 管事实，这个管关系，两个 block 拼进同一个提示词就行。

**Q: 数值有依据吗？**

> 没有。30/2/48 是跑了一个 QQ 群几个月试出来的，不是论文。这也是我发出来的原因
> ——想看看别人的参数是什么。

---

## 五、发布顺序建议

1. **先发 V2EX**（中文语境，能讲清 prior art 更容易被接受）
2. 看反应，24 小时内回复所有评论
3. 如果 V2EX 反响正常，再发 Reddit（英文用户对"我做了个东西"更挑剔，
   但prior art 那段能挡住大部分攻击）
4. X 最后发，当记录

**别一次全发**：如果 Reddit 上被打脸，还有时间改说法。
