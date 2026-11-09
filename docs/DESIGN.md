# Design boundaries and independent implementation

persona-memory is an embeddable memory and optional relationship-state component. It manages sourced updates, time/evidence lifecycle, bounded selection and explicit persistence. It does not start an autonomous Agent or model retry loop, and the core has no runtime dependencies.

| Module | Responsibility |
| --- | --- |
| retrieval.js / record-context.js | Scope/state filtering before bounded ranking; complete budgeted JSON; external scores treated as data |
| records.js | Explicit subjects/kinds, bounded JSON, independent lifetimes, replacement and validation |
| memory.js | Host-independent ingestion, scope, context, acknowledgement and storage coordination |
| text-policy.js | Bounded lexical evidence checks and a single quote scan, avoiding quadratic backtracking |
| lifecycle.js | Non-mutating evidence lifecycle reduction and bounded retention selection |
| limits.js | Explicit ceilings; reject valuable-profile overflow instead of silent eviction |
| turns.js | Capacity/deadline leases; no automatic retries or late commits |
| presets.js | Scenario configuration; host events establish trust |
| acknowledge.js | Explicit unavailable-confirmation results without blocking completed responses |

See NOTICE and the origin review for historical design references and limitations. Independently authored expressions do not establish ownership of general ideas or guarantee worldwide originality.

## Update pipeline

Bounded input → read-only validation and policy calculation → capacity checks → delivery deduplication → state reduction → explicit persistence.

Context preview does not mutate persisted state. Confirmation is separate and turn IDs bound duplicate counting. Source evidence and use counts are distinct: consumption is not fresh factual evidence.

## Resource and time bounds

Defaults include 10,000 profiles, 10,000 lightweight visitors, 2,000 delivery-deduplication entries and 100 history summaries. Visitors retain recent entries at capacity; full profiles reject additions with `ERR_MEMORY_CAPACITY`. The host chooses cleanup, partitioning or an allowed higher limit. Serialized size is checked before replacement so a store does not write snapshots it cannot reload.

Bridge timeouts default to 30 seconds and allow up to five minutes. Callbacks receive `{signal}` for cancellation-aware clients. Expiry stops internal waiting and late commits; an external call that ignores cancellation continues occupying its lease to prevent retry amplification. Event-loop timers cannot preempt a synchronous infinite loop: untrusted callbacks require a Worker or separate process. Tests use external watchdogs for that boundary.

## Evolution

Correctness, evidence, time and budgets take priority over infrastructure expansion. Keep compatible interfaces and parameter provenance; avoid rewrites that merely rename familiar concepts. Temporal intervals distinguish the latest submitted head from the currently effective value. Store CAS prevents stale overwrites; transfer needs explicit subject mappings and previews. Optional SQLite, semantic retrieval, handoff, local sharing and experience feedback are separate modules; full event sourcing remains a future decision based on actual needs.
