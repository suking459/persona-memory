# Scoped retrieval and bounded memory context

The core performs bounded local lexical retrieval without a model or vector service. Optional [semantic retrieval](semantic.md) is explicit. Time intervals and candidate boundaries remain authoritative; see [time/storage](time-storage.md) and [learning](learning.md).

```js
const project={type:'project',id:'project-a'},owner={type:'user',id:'owner'};
const found=pm.searchMemories({subjects:[project,owner],query:'release requirements',
  kinds:['constraint','decision','fact'],locale:'en',limit:5});
console.log(found.matches.map(hit=>({id:hit.record.id,key:hit.record.key,score:hit.score,reasons:hit.reasons})));
```

Supply exactly one of `subject` or `subjects`, with at most 32 explicit subjects. Type, ID and optional chatId must match exactly. Authorize before selection. Only effective, unexpired, dependency-valid records participate; external scores cannot revive inactive/retired records. A controlled `now` is not a full as-of query.

## Search options

| Option | Default / maximum | Meaning |
| --- | --- | --- |
| query | Empty allowed; 1024 UTF-16 units | Empty query explicitly selects current scoped records |
| kinds / keys / sources | Optional; 6 / 32 / 6 entries | Exact metadata filters; empty arrays select none |
| observedAfter / observedBefore | Optional, inclusive milliseconds | Evidence time, not use time |
| limit | 10 / 1000 | Returned matches; zero permits statistics only |
| maxCandidates | 1000 / 10000 | Records considered after metadata filtering |
| minScore | 0 / 1024 | Relevance threshold, never factual certainty |
| relevance | Up to 1000 `{id,score}` rows, score 0–1 | Host-precomputed scores; no callback/provider invocation |

Matching normalizes to NFC and applies configured locale case handling while preserving stored text. Bounded CJK character/bigram matching, words and identifiers support literal queries; C++ and 1.0 remain meaningful. Fields joined with separators can yield constituent words. Ranking uses keys/values, not social score, IDs or inspection frequency.

This is not general semantic understanding, synonym inference or fact verification. Different-language synonyms need not match. Host-computed relevance still cannot bypass scope, source, status or time filters. Matches contain detached complete records, scores, terms, reasons and lexical/external/hybrid/filter method labels; unrelated recent rows do not fill an empty result.

Text work is separately limited to 1,000,000 UTF-16 units. `scannedCharacters`, `omitted.workLimit`, `omitted.textLimit` and `truncated` report incomplete search. `matched` counts inspected matches only. `omitted.resultLimit` is a return cap, not an incomplete scan.

## Context budgets

```js
const context=pm.buildMemoryContext({subjects:[project,owner],query:'release',locale:'en',budget:2000,maxRecords:8});
// Pass context.text as reference data to the real model.
// After actual successful consumption:
pm.confirmContext(context,{turnId:'request-1'});
```

The budget includes the header, whole JSON records, subjects, provenance and time/dependency metadata. Entire records are omitted when they do not fit. Character budget defaults to `maxChars`, allowed 0–100000; `maxRecords` defaults to 8, maximum 64. Results include selected records, omission details/counts, character counts and search statistics.

Exact token budgets require both `tokenBudget` and a synchronous `countTokens` returning a nonnegative integer. The final output is rechecked. Mutating records during token counting invalidates the preview rather than confirming stale content. JSON protocols use character budgets because they cannot carry callbacks. This budget covers only the memory block; hosts budget the complete model input.

JSON escapes newlines, quotes, bidi controls and line separators while preserving recoverable values. Content remains data rather than instructions; hosts own role and permission design.

## Standing constraints and relevant context

Do not rely on keyword matches for requirements that must always be supplied. Explicitly build a `query:''`, `kinds:['constraint']` block, then a current-question block. Inspect omissions and combined budget before use.

```js
const rules=pm.buildMemoryContext({subject:project,kinds:['constraint'],query:'',budget:1000});
const relevant=pm.buildMemoryContext({subjects:[project,owner],query:question,budget:1500});
pm.confirmContexts([rules,relevant],{turnId:'request-2'});
```

A confirmation batch allows at most 16 contexts, 64 distinct typed records and 32 subjects. Social contexts must share the appropriate chat boundary. Any invalid credential/limit fails the complete acknowledgement; overlaps count once and produce one turn summary. Preview does not mutate persisted state. Confirmation renews neither evidence time, expiry nor revision. Corrections, deletion/import and stale dependencies invalidate affected previews.

There are at most 128 ephemeral context credentials, valid ten minutes and lost on restart. Deduplication follows `dedupeLimit`/`dedupeDays` and deletion; it is not an infinite ledger. Subject deletion also removes empty-result usage and pending acknowledgements.

## Task context

Use `buildTaskMemoryContext` when one project or task requires evidence for several parts of the request. `facets` are short lexical queries supplied by the caller. `includeStanding` adds current constraints that may be useful even without matching the query.

```js
const context=pm.buildTaskMemoryContext({
  subject:project,
  query:'release status',
  facets:['test environment','migration owner'],
  includeStanding:true,
  budget:4000,
});
```

The Agent MCP equivalent is `memory_context` with `scope`, `query`, `budget`, and `task: {facets: ['test environment', 'migration owner'], includeStanding: true}`. The server obtains the subject from the binding and refreshes the store before selecting. Task mode uses local lexical search. The ordinary context operation can still use its existing optional semantic configuration.

Use one to four queries in total. The method considers at most 1,000 candidates per pass, retains up to 16 matches per query and eight standing constraints, and interleaves the passes by rank. It deduplicates record IDs and keeps up to 64 candidates before applying a single character, record and optional SDK token budget. Standing constraints follow the same caller filters and appear as data. Their presence does not grant permission or change project instructions.

`taskSelection.facets` and `taskSelection.standing` show per-pass counts and omissions. `taskSelection.candidateIds` reflects the bounded union before rendering. The top-level `search` describes the first query. The returned `records`, `omitted`, and `text` show the actual packing result. A tight budget can exclude some or all candidates. Use `confirmContext` or the separate Agent confirmation call after actual use.

## Vendor-independent model bridge

```js
import {createMemoryBridge} from 'persona-memory/adapters/memory';
const bridge=createMemoryBridge(pm,{subjects:[project,owner],budget:2000,timeoutMs:30000});
const result=await bridge.invoke({text:'When can we release?',turnId:'request-3'},
  async({text,memory},{signal})=>callYourModel({text,memory,signal}));
```

The bridge injects existing memory; it does not learn or create social profiles automatically. Text is limited to 100000 characters; supply a short separate query for long input (query limit remains 1024). Invoke-time query can override a fixed constructor query.

Concurrent/successful retries share one invocation; changed text/query with the same normalized turn ID fails. Failed calls are not confirmed and require explicit retry. Cancellation is requested on timeout; late results cannot confirm. Host process/Worker isolation is needed for untrusted synchronous loops or callbacks ignoring cancellation. Asynchronous persistence is awaited and the deadline rechecked before model execution; a late store return cannot start a model.

Consume streaming responses fully inside the callback before returning the final value. Returning an unconsumed stream fails and requests cancellation rather than counting premature success. Later mutation of the caller's input object does not change captured turn identity. `npm run example:retrieval` is a key-free mechanism demonstration, not a model-quality result.

## HTTP/MCP and evidence boundaries

HTTP read routes: `/api/memory/search`, `/api/memory/context`, `/api/memory/get`; confirmation routes `/api/confirm` and `/api/confirm-contexts`. Put/forget/delete-subject require explicit admin enablement. Conflicts/capacity return 409 with code; invalid arguments return 400. Storage failures are visible.

Legacy MCP exposes `memory_search_records`, `memory_records_context`, `memory_get_record` and `memory_confirm_contexts`; the [scoped Agent channel](agent-integration.md) provides additional role-bound entry points. Optional model tool selection does not guarantee every-turn recording.

Usage summaries contain bounded record IDs/subjects, not value bodies or original queries. Historical deterministic tests and 33 synthetic retrieval cases are not production accuracy, LongMemEval scores or a real-model A/B study. Consult the current milestone reports for actual source/version and cross-environment evidence.
