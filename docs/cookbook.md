# 六个接入配方

原有关系配方针对 GitHub 源码 0.4.0；标注 0.6 的通用记忆示例仅在本地 1.0 开发中可用，尚未发布。每个配方共用核心库，不复制算法。配置 storage 后由宿主定时 maintain，并在消息/使用确认后 flush。

## 1. 社群机器人：多人、频道隔离

```js
import {PersonaMemory} from 'persona-memory';
import {createPreset} from 'persona-memory/presets';
const pm=new PersonaMemory({config:createPreset('community')});
pm.ingest({chatId:'discord:guild:channel',userId:'member',text:'今天好累',mentionsSelf:true,eventId:'m1'});
const context=pm.buildContext({chatId:'discord:guild:channel',userIds:['member']});
```

预期：有临时疲劳观察，其他频道不自动共享。仅 @/回复/直接互动及续聊计关系分。将 context.text 放进真实模型输入，成功使用后再 confirmContext。完整平台例子见 examples/discord-bot.js。

## 2. 日常陪伴：关系与当前状态分开

```js
const pm=new PersonaMemory({config:createPreset('companion')});
pm.ingest({chatId:'dm',userId:'person',text:'今天好累',directedToBot:true,eventId:'m1'});
// 本地 0.6：稳定偏好独立于临时状态，不沿用标签的长期保鲜规则。
pm.putMemory({subject:{type:'user',id:'person'},kind:'preference',key:'reply-length',value:'short',source:'user'});
```

预期：临时疲劳仍按标签过期，明确的通用偏好保留到替换或删除；维度中的信任不因夸奖自动增加。通用偏好通过 listMemories 读取，由宿主使用；旧 buildContext 尚不自动包含它，本地 0.7 可使用 buildMemoryContext 或通用模型桥选择并注入，见 retrieval.md。

## 3. 客服：业务系统提供状态

```js
const pm=new PersonaMemory({config:createPreset('support')});
pm.setTag({chatId:'ticket-1',userId:'customer',tag:'待跟进',source:'host',expiresAt:null,eventId:'case-created'});
pm.setTag({chatId:'ticket-1',userId:'customer',tag:'已解决',source:'host',replace:['待跟进'],eventId:'case-resolved'});
```

预期：已解决后旧状态不再注入。订单、退款与工单事实来自业务系统；不能从一句“解决了吗”推断工单已解决。关系分不控制服务资格。浏览器中的客服场景可直接演示。

## 4. 游戏 NPC：聊天与履约分开

```js
const pm=new PersonaMemory({config:createPreset('npc')});
pm.ingest({chatId:'npc-alex',userId:'player',text:'你好厉害',directedToBot:true,eventId:'dialogue-1'});
pm.recordEvent({chatId:'npc-alex',userId:'player',type:'promise-kept',changes:{trust:10},eventId:'quest-1'});
```

预期：聊天积累熟悉程度，游戏系统确认履约后才改变信任。重复 quest-1 不重复加分，当前 NPC 的状态不自动传给另一个 NPC。没有主张这些数值模拟真实心理。

## 5. 个人助手：复用现有框架

```js
import {createLangChainBridge} from 'persona-memory/adapters/langchain';
const bridge=createLangChainBridge(pm,{chatId:'assistant',userId:'owner'});
const result=await bridge.invoke(
  {text:'今天好累',turnId:'turn-1'},
  async input => modelChain.invoke(input), // 模板需使用 input.persona_memory
);
```

预期：关系资料到达模型调用位置。examples/langchain.js 提供无需模型密钥的真实 Runnable 验证例子。仅传 configurable.memory 不会自动安装任意记忆钩子。

## 6. 隔离部署：不同租户分文件

```js
const a=new PersonaMemory({storage:'./data',scope:'tenant-a',persona:'assistant'});
const b=new PersonaMemory({storage:'./data',scope:'tenant-b',persona:'assistant'});
a.ingest({chatId:'support',userId:'same-id',text:'你好',directedToBot:true});
console.log(b.getProfile('support','same-id')); // null
```

预期：相同 userId 在两个 scope 中互不影响。API 调用方的鉴权与租户选择由宿主管理；库不会从 HTTP 请求自动推断用户属于哪个租户。单个存储文件仅支持单进程写入，不等于完整多租户 SaaS。

## 非 Node 宿主

运行 npm run http，设置 PM_STORAGE/PM_TOKEN，再调用：

```sh
curl -H "Content-Type: application/json" -H "Authorization: Bearer <local-token>" -d '{"chatId":"room","userId":"person","text":"今天好累","directedToBot":true,"eventId":"m1"}' http://127.0.0.1:8791/api/ingest
```

POST /api/context 获取 block 与 context；实际使用后 POST /api/confirm，提交 contextId 与唯一 turnId。真实 token 只放在本机环境中。
