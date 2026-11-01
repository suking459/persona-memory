# Optional semantic retrieval — 1.3 local development

中文概览：默认仍为本地词法检索。所有者明确配置嵌入服务后，可按向量相似度补充召回；失败会标明原因并回退本地检索。模型不能改服务地址或扩大范围。当前未发布，真实模型的跨语言效果须按所选服务另测。

## Configure from the actual Agent flow

Prepare a new bundle using a model you already operate:

~~~powershell
node tools/connect.mjs prepare --host workbuddy --project D:/my-project --out D:/memory-with-semantic --locale zh-CN --embedding-provider ollama --embedding-model YOUR_INSTALLED_EMBEDDING_MODEL
~~~

The default Ollama endpoint is local /api/embed at port 11434. Preparation writes configuration only. It does not start a service, install/pull a model or change a host's existing settings. Enable the generated bundle using the [Agent guide](agent-integration.en.md).

For an OpenAI-compatible endpoint, explicitly provide --embedding-provider openai-compatible, --embedding-endpoint, --embedding-model and, when needed, --embedding-key-env PM_EMBEDDING_API_KEY. The binding contains the environment-variable name, never its value. That variable must be available in the process launching the MCP server; changing an unrelated terminal does not update an already-running desktop application.

Only configured semantic calls send queries and selected approved memory values to the chosen endpoint. Scope IDs, candidates awaiting review and other subjects are excluded. The normal default makes no embedding calls. HTTPS is required for remote endpoints; plaintext HTTP is limited to loopback. URL credentials, query strings and fragments are rejected. This adapter implements the documented Ollama and float OpenAI-compatible response shapes, not every provider's custom authentication or Azure-specific API.

## SDK

~~~js
import {createSemanticRetriever, createHttpEmbedder} from 'persona-memory/adapters/semantic';

const embed = createHttpEmbedder({
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434/api/embed',
  model: 'YOUR_INSTALLED_EMBEDDING_MODEL'
});
const retriever = createSemanticRetriever(pm, {
  subject: {type: 'project', id: 'work'},
  embed,
  locale: 'en'
});
const result = await retriever.search({query: '我喜欢喝什么？', locale: 'zh-CN'});
const context = await retriever.buildContext({query: 'preferred beverage', budget: 4000});
~~~

A host can supply an embed callback instead of HTTP. It receives a bounded array of texts, locale and AbortSignal. Return one finite nonzero vector per input in order, with consistent dimensions. Callback code is host code; the adapter cannot sandbox it or force an arbitrary promise to stop.

Subjects and optional source/kind/key filters are fixed at construction. Per-query callers can change query, locale, result/context limits and cancellation, but cannot add a subject or endpoint.

## Bounded behavior

1. Select current approved records within fixed subjects and filters. Invalid derived records are excluded before any provider call.
2. Merge lexical candidates with recent eligible candidates by ID, up to 64 by default (maximum 128).
3. Embed the query and cache misses in one attempt. Default input budget is 256 KiB. Whole documents that do not fit are omitted from semantic scoring; source records are not truncated.
4. Validate vector count, index mapping, dimensions and finite values. The default minimum cosine similarity is 0.55; this is a starting policy, not a measured universal accuracy threshold.
5. Recheck the memory epoch, then use the core's scoped current-record filtering and complete context budget. Agent calls also re-read their persistent view after the asynchronous work; a changed or corrupted file cannot produce a cached success.

Timeout defaults to 5 seconds and is bounded to 60 seconds. No automatic retry, queue or model download runs. Provider failures use lexical fallback with semantic.mode=fallback and a safe reason; SDK fallback:error is available for callers requiring a semantic result. Caller cancellation rejects instead of producing an answer.

The per-instance cache is bounded to 128 entries by default (maximum 512) and keyed by the current memory epoch. It contains detached vectors and content fingerprints, not source text. Changed epochs cannot reuse it. clear() explicitly discards it. Cache is not persisted. A changed returned model name or vector dimension fails rather than mixing incompatible embeddings; pin models and recreate the connection when changing them. A provider may change weights under an unchanged name, which this interface cannot independently authenticate.

stats().providerAttempts counts callback attempts, not guaranteed billable HTTP requests or model token usage. Returned semantic diagnostics show mode, cache hits, sampling/input omissions and fallback reason. Relevance scores never establish truth, authority or permission.

Context previews do not confirm use. Confirm only after a successful response, through the existing connection-owned confirmation path. The core remains free of runtime dependencies.

## Evaluate before enabling real data

Offline orchestration fixture:

~~~sh
node tools/evaluate-semantic.mjs --fixture
~~~

This uses oracle vectors and must not be presented as measured model quality.

To test a service you explicitly operate, use --provider, --endpoint and --model, optionally --api-key-env and --threshold. The command sends only its included synthetic labeled cases, never real stored chats. It reports top-result relevance, abstention cases, lexical comparison and fallback counts. An existing --out file is refused. Service failure and poor synthetic relevance both produce a nonzero exit; inspect the report.

The current 13-case set includes English, Chinese, French, Spanish, Arabic, Hindi and Japanese questions over three English facts plus no-answer cases. It is a small diagnostic set, not a native-speaker study, production benchmark, automatic translation certification or claim of support for every language.

## Verification boundary and protocol references

Local tests use controlled HTTP services, synthetic credentials and a real MCP subprocess. No actual commercial model account or installed Ollama model was used to measure relevance. Configuration generation and protocol checks remain distinct from target-host model sessions.

The wire mappings were checked against [OpenAI's embeddings reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create) and [Ollama's embed reference](https://docs.ollama.com/api/embed). The Ollama request disables truncation; OpenAI-compatible results are matched by index. Service-specific access, limits and model quality must be verified with the selected provider.
