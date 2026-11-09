# Six integration recipes

All recipes compose the same core. Default policy does not infer emotion/health tags from messages; hosts explicitly supply state or custom rules. With storage, persist after changes/confirmation and schedule maintenance explicitly.

## 1. Community bot

```js
import {PersonaMemory} from 'persona-memory';
import {createPreset} from 'persona-memory/presets';
const pm=new PersonaMemory({config:createPreset('community')});
pm.ingest({chatId:'discord:guild:channel',userId:'member',text:'Hello',mentionsSelf:true,eventId:'m1'});
const context=pm.buildContext({chatId:'discord:guild:channel',userIds:['member']});
```

Channel-scoped state stays separate. Direct interactions and a bounded continuation window can score; ordinary ambient messages do not. Send context to the real model and confirm only successful use. See `examples/discord-bot.js`.

## 2. Companion with stable preferences

```js
const pm=new PersonaMemory({config:createPreset('companion')});
pm.ingest({chatId:'dm',userId:'person',text:'Hello',directedToBot:true,eventId:'m1'});
pm.putMemory({subject:{type:'user',id:'person'},kind:'preference',key:'reply-length',value:'short',source:'user'});
```

Lasting preferences retain their own lifetime, separate from temporary tags. Trust does not increase merely because of praise. Select typed preferences with `buildMemoryContext` or the generic bridge; relationship-only `buildContext` does not inject them automatically.

## 3. Authoritative support state

```js
const pm=new PersonaMemory({config:createPreset('support')});
pm.setTag({chatId:'ticket-1',userId:'customer',tag:'unresolved',advice:'Continue the open issue.',source:'host',expiresAt:null,eventId:'case-created'});
pm.setTag({chatId:'ticket-1',userId:'customer',tag:'resolved',advice:'Do not reopen the resolved issue without new evidence.',source:'host',replace:['unresolved'],eventId:'case-resolved'});
```

Resolved state replaces the old tag. Orders/refunds/tickets come from business systems, not a question asking whether something is resolved. Relationship score does not control service eligibility. The browser demo illustrates this flow without a model.

## 4. NPC dialogue and confirmed events

```js
const pm=new PersonaMemory({config:createPreset('npc')});
pm.ingest({chatId:'npc-alex',userId:'player',text:'Hello',directedToBot:true,eventId:'dialogue-1'});
pm.recordEvent({chatId:'npc-alex',userId:'player',type:'promise-kept',changes:{trust:10},eventId:'quest-1'});
```

Dialogue affects familiarity; host-confirmed events affect trust. Retained duplicate quest IDs do not double-score and other NPCs do not inherit state. These are configurable application rules, not validated psychological laws.

## 5. Existing model framework

```js
import {createLangChainBridge} from 'persona-memory/adapters/langchain';
const bridge=createLangChainBridge(pm,{chatId:'assistant',userId:'owner'});
const result=await bridge.invoke({text:'Hello',turnId:'turn-1'},
  async input=>modelChain.invoke(input)); // Template must consume input.persona_memory.
```

`examples/langchain.js` uses a real Runnable and a network-free stand-in. Merely passing `configurable.memory` does not install arbitrary hooks. Use the optional LlamaIndex bridge only with its tested version.

## 6. Separate application scopes

```js
const a=new PersonaMemory({storage:'./data',scope:'tenant-a',persona:'assistant'});
const b=new PersonaMemory({storage:'./data',scope:'tenant-b',persona:'assistant'});
a.ingest({chatId:'support',userId:'same-id',text:'Hello',directedToBot:true});
console.log(b.getProfile('support','same-id')); // null
```

The host selects and authorizes tenants; the library does not infer membership from HTTP requests. Separate filenames and local cooperative CAS do not constitute a public multi-tenant SaaS security boundary.

## Non-Node hosts

Run the loopback HTTP service with local storage/authentication settings. Ingest through `/api/ingest`, preview through `/api/context`, then acknowledge actual successful use through `/api/confirm` with context/turn IDs. Keep real tokens in local secrets, outside the repository. The [scoped Agent connection guide](agent-operations.md) is preferred for MCP-capable hosts.
