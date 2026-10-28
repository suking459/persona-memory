# 来源与授权链 / Attribution

本库不是凭空写的，也不假装是。授权链完整，逐层列清：

```
Derpyu520/qq-bridge   (MIT)
        ↓  被 Kondius 改造成
Kondius/qq-agent      (MIT) ← 本库的设计与算法从这里来
        ↓  抽出 plugins/memory-tree，重写为独立库
suking459/persona-memory (MIT) ← 就是这里
```

## 具体来说

**借鉴的部分**（来自 [Kondius/qq-agent](https://github.com/Kondius/qq-agent) 的 `plugins/memory-tree`）：

- 好感度 5 档制（生疏 / 眼熟 / 熟了 / 亲近 / 很铁）与分值表
- 每日涨分上限 30、每天衰减 2、单条 ±8 封顶
- 标签 48 小时 TTL、重复命中顺延、6 轮 + 3 天 + 2 次晋升长期、每人 16 上限
- 说话风格统计的维度（长度 / 问句率 / 表情率 / 夜间率 / 口头禅滑窗）
- 提示词「最多 4 人 / 700 字」的预算思路

**重新实现的部分**（本仓库的实际代码）：

- `src/index.js` 未包含 QQ-Agent 的源码，是按上述设计重写的
- 去掉了对 QQ / OneBot 会话模型、JSON 存储路径、插件钩子的依赖，改成宿主无关的通用接口
- `adapters/`（onebot / generic / http / mcp / langchain）全部为本仓库新写
- `demo/`、`index.d.ts`、测试全部为本仓库新写

**两者关系**：概念与参数来自上游，代码是重写。即使如此，上游的 MIT 版权声明也完整保留在本仓库的 [LICENSE](LICENSE) 里——这是 MIT 的硬性要求，不是可选项。

## 如果你要用

MIT 允许你用、改、商用、闭源。唯一的义务是**保留 [LICENSE](LICENSE) 里的两段版权声明**。

就这么一条，谢谢配合。

## 如果你想追更上游

- [Kondius/qq-agent](https://github.com/Kondius/qq-agent) —— 完整的 QQ 群机器人应用，本库的设计母体
- [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) —— 更早的 QQ ↔ DSH 桥接

如果你想要的是「完整的群机器人」而不是「一个记忆层」，直接去用 qq-agent。
