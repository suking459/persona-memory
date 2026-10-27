# 发布说明

## 一、GitHub 仓库名

```
persona-memory
```

备选（如果重名）：
- `relationship-memory`
- `persona-state`
- `social-memory`

## 二、仓库简介（Description，120 字以内）

```
Social state layer for conversational agents — affinity that decays, tags that expire,
styles learned locally, prompt blocks that respect a budget. No LLM calls, zero deps.
```

中文版（如果要中文首页）：
```
给对话 agent 的社交状态层：会衰减的好感度、会过期的状态标签、本地统计的说话风格、
受预算约束的提示词注入。零 LLM 调用，零依赖。
```

## 三、Topics（GitHub 标签，最多 20 个，建议 8-12 个）

```
agent-memory
persona
affinity
relationship
chatbot
llm
ai-companion
social-simulation
npc
memory
conversational-agent
state-machine
```

复制用的逗号版：
```
agent-memory, persona, affinity, relationship, chatbot, llm, ai-companion, social-simulation, npc, memory, conversational-agent, state-machine
```

## 四、搜索关键词（写进 README 和 package.json keywords）

**英文**
```
agent memory, persona memory, relationship memory, affinity system,
AI companion memory, chatbot user profile, NPC relationship, social simulation,
LLM long-term memory, decaying affinity, tag lifecycle, prompt budget
```

**中文**
```
AI 记忆, agent 记忆, 好感度系统, 关系记忆, 用户画像,
陪伴 AI 记忆, NPC 记忆, 群聊机器人记忆, 长期记忆, 状态标签
```

## 五、发布步骤

### 方式 A：GitHub CLI（推荐，装好后一条命令）

1. 装好 `gh`（已由脚本安装）
2. **你自己**执行登录（浏览器会弹授权页）：
   ```bash
   gh auth login
   ```
   选择：`GitHub.com` → `HTTPS` → `Login with a web browser` → 复制一次性码 → 浏览器里粘贴 → 授权

3. 登录完成后告诉我，我执行：
   ```bash
   cd D:\REA\persona-memory
   gh repo create persona-memory --public --source=. --push --description "..."
   ```

### 方式 B：纯网页（不用 gh）

1. 打开 https://github.com/new
2. 仓库名填 `persona-memory`，选 **Public**，**不要**勾选初始化 README
3. 点 Create repository
4. 把页面上的仓库地址发给我，我用 git 推送（需要你先配置一次凭证）

### 方式 C：配置 SSH（最干净，但要生成密钥）

```bash
ssh-keygen -t ed25519 -C "your@email"
# 把 ~/.ssh/id_ed25519.pub 内容粘到 https://github.com/settings/keys
```

---

## 六、发布后要做的事

- [ ] 确认 LICENSE 里的年份/作者
- [ ] 打开仓库 Settings → 确认 Topics 已填
- [ ] 发一条 Release（v0.1.0），附 README 内容
- [ ] 如果要发 npm：`npm publish`（需要 npm 账号 + 2FA）

## 七、作者署名

当前 `LICENSE` 写的是 `persona-memory contributors`，`package.json` 里 repository 是 `PLACEHOLDER`。
登录后告诉我你的 GitHub 用户名，我替换掉。
