# Integration validation and limitations

## Recorded integration scope

| Entry | Tested dependency/environment | Verified | Not certified |
| --- | --- | --- | --- |
| Core/HTTP/MCP | Windows/Ubuntu supported Node scopes | Ingestion/records, budgets, versions/candidates, storage/protocol | macOS/ARM, network drives, long-term production load |
| Discord | discord.js 14.27.0 | Offline message shapes, mentions/replies and bot filtering | Login, permissions, reconnect |
| LangChain | @langchain/core 1.3.1 | Actual Runnable receives memory | External model APIs/every framework version |
| LlamaIndex TS | @llamaindex/core 0.6.23 | Actual Memory.add/get and composition | External models/future replacements |

At installation during the recorded batch, npm marked @llamaindex/core 0.6.23 and its environment package deprecated. The optional compatibility bridge is not a core dependency or promise of all future LlamaIndex support.

## Discord

Set DISCORD_TOKEN locally and run example:discord with discord.js installed. Ordinary message contents involve privileged Message Content intent and platform exceptions; configure according to [Discord's reference](https://docs.discord.com/developers/events/gateway#message-content-intent). DM/channel/mention/reply/bot messages are handled separately. Parsing makes no network request. The example presents relationship data without a model and therefore does not confirm model use.

## Framework composition

Passing configurable.memory to a modern Runnable does not automatically call arbitrary BaseMemory-shaped objects. createLangChainBridge is explicitly composed through RunnableLambda and a template consuming persona_memory. examples/langchain.js exercises a real Runnable with a network-free stand-in. Legacy loadMemoryVariables/saveContext shapes require actual host invocation and do not assign one speaker's text to all participants.

LlamaIndex Python and TS APIs are separate. createLlamaIndexBridge composes TS Memory.add/get with relationship context, not a universal replacement Memory. examples/llamaindex.js uses actual Memory with a stand-in response. Non-Node hosts should call HTTP rather than duplicate algorithms. [TS Memory reference](https://developers.llamaindex.ai/typescript/framework-api-reference/classes/memory/). Strict declarations additionally need the explicit development-only ajv package; it is not a core runtime dependency.

## Runtime evidence

Core uses Node built-ins and targets Node 18+ syntax; optional development SDKs require newer runtimes. Deploy on a maintained runtime rather than equating engines minimum with a security-maintenance promise. Historical [1.0 hardening](1.0-HARDENING.md) has six Windows/five Ubuntu combinations; later source has its own matrix in [1.8 validation](1.8-VALIDATION.md). Historical [CI](https://github.com/suking459/persona-memory/actions/workflows/ci.yml) does not replace current-source checks. [Agent acceptance](AGENT-ACCEPTANCE.md) separately records real host/model versions.

## Failure and retry boundaries

Before model execution, a host may explicitly continue with empty relationship text if reading fails; preserve corrupt files and request recovery rather than overwriting them with empty state. Failed model calls do not confirm use. Use stable message IDs and unique turn IDs for bounded explicit retries.

Bridge instances retain at most 128 turn retries; concurrent/completed duplicates reuse results. Failed calls can retry; LlamaIndex does not append the same already-written user message twice. External-service timeouts/idempotency/history persistence remain host responsibilities, not cross-process exactly-once execution. Core deletion does not erase external framework history/caches.

If tags change or previews expire during a completed model call, return the generated answer with usage context-unavailable rather than fabricated counts or an infinite acknowledgement retry.
