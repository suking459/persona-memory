# Use cases and integration choices

persona-memory is an embeddable component that stores records under explicit subjects and provides bounded reference context on request. It combines with different models, interfaces and business systems.

| Application | Subjects and records | Workflow |
| --- | --- | --- |
| Personal assistant | User preferences, lasting requirements, temporary state | Explicit settings can be written directly; extracted suggestions enter review |
| Coding/project assistant | Project constraints/decisions; task state/experience | Select standing constraints explicitly, then retrieve for the current question |
| Support | User preferences; ticket state and next actions | Use the support preset; authoritative systems confirm business state |
| NPC/interactive character | Relationship state; world and quest facts | Game events confirm outcomes; objective facts remain separate from social scores |
| Multiple tools/agents | Project/task requirements and results | Explicit subject mapping, local shared grants and conflict handling |
| Learning/creation | User learning preferences; project settings; task goals | Keep facts, constraints and temporary goals distinct |

Experience verification is a caller assertion with an evidence reference, not universal applicability or model self-certification. Keep conditions and allow later correction.

## A request lifecycle

1. Authorize the caller and determine scope, subject and stable message/turn IDs.
2. Write explicit instructions through trusted code; propose externally extracted content for review.
3. Handle retention explicitly, retrieve within the current subject and inspect omissions/budgets.
4. Supply the context as data to the real model. Stored text never gains instruction authority.
5. Confirm actual successful consumption using a turn ID. Failed, cancelled and incomplete streams are not successful use.
6. Persist changes and explicitly handle conflicts, corruption, capacity and deadline errors.

Preview, use and evidence are distinct actions. Reading more often does not make a claim truer or refresh old evidence.

## Entry points

| Existing system | Entry point |
| --- | --- |
| Node.js / TypeScript | Direct SDK and generic model bridge |
| Python or another service language | Local HTTP with application-level identity and authorization |
| MCP-capable host | Scoped stdio Agent service; host organizes when tools run |
| Human review | Owner CLI and preview/apply management |
| Discord / OneBot bot | Platform parser, then chosen relationship/typed-memory APIs |
| LangChain Runnable | Explicit bridge/template composition |
| Existing LlamaIndex TS integration | Optional compatibility bridge pinned to its tested version |

Run `persona-memory-http` for the local HTTP service. Configure `PM_STORAGE`, `PM_PERSONA`, `PM_SCOPE`, optional `PM_TOKEN` and `PM_PORT`; management writes also require `PM_ALLOW_ADMIN=1`. Loopback Host/Origin and actual port must match. See [API](API.md).

For Agent installation use the [connection guide](agent-operations.md). Use absolute Node/script/storage paths in real host configurations; relative paths depend on the host's working directory. Keep credentials and original chats out of Git.

## Boundaries

The library suits explicit records, explainable selection, correction and bounded history. Full document indexing, arbitrary identity merging, complete event sourcing, cloud hosting and autonomous task execution require separate host capabilities. Optional semantic retrieval is not built-in universal cross-language understanding. Local sharing is not public multi-tenant authentication.

Choose the subjects, authoritative evidence, retention, permissions and context budget first, then select optional relationship or extraction layers. See [typed memory](typed-memory.md), [retrieval](retrieval.md), [storage](time-storage.md) and [learning](learning.md).
