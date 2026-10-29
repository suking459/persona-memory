# Changelog

## 1.0.0 — 2026-10-29

The first unified release of the host-independent memory library. GitHub releases and npm registry publication are separate channels; use the fixed v1.0.0 installation instructions in README.

### Memory and retrieval
- Typed user/project/task memories: preference, fact, constraint, decision, episode and state, with provenance, bounded JSON values and independent retention.
- Scoped lexical retrieval, filtering, explanations and complete record contexts under explicit character/token budgets.
- Pure preview and idempotent acknowledgement of contexts actually used in a successful model call.

### Corrections, time and storage
- Explicit replacement and revisions, effective/knowledge time queries, future activation and bounded version retention.
- JSON and in-memory stores, a pluggable asynchronous CAS contract, file conflict detection and explicit recovery.
- Current-value export, explicit subject mapping, conflict preview and atomic batch import; schema 5 with migrations from schemas 1–4.

### Reviewed learning and optional relationship state
- Expiring candidates with review/revision/accept/reject, stale-update protection and bounded host-provided extraction.
- Opt-in new-field acceptance policy and task experiences with applicability and host confirmation metadata.
- Optional relationship state, host-corrected tags, direct interaction limits, decay, dimensions, style and four presets.

### Integration and hardening
- Node/TypeScript, HTTP, MCP, review CLI, platform parsers, generic model bridge and optional framework adapters.
- Safe bounded snapshot import/reload, strict UTF-8, regular-file reads, growing-file limits and owned temporary-file cleanup.
- Inherited-name IDs/dimensions, independent candidate capacity, local HTTP Host validation and MCP stdout backpressure.
- Windows/Ubuntu runtime matrices, process-crash recovery, synthetic evaluations, public types and offline installed-package validation. Conditions and limits are documented.
- Rewritten project overview, use cases, installation, migration and release notes. Runtime dependencies remain zero; existing copyright and provenance are preserved.

### Upgrade notes
- Snapshots now use schema 5; back up before upgrading and use the old backup when rolling back.
- Preview does not count model use; integrations must explicitly confirm successful use.
- File writes may reject conflicts; strict UTF-8 and plain-data validation reject malformed inputs instead of repairing them silently.
- No claim of live-model accuracy, all-platform compatibility, full event sourcing or database-level power-loss durability.

## 0.4.0 source baseline — 2026-10-29

### Relationship state
- Explainable context previews and explicit, idempotent usage confirmation.
- Evidence provenance, host corrections, tag removal, and optional familiarity/trust dimensions.
- Application scope and channel-scoped tags, user deletion, bounded retention and diagnostics.

### Correctness and execution bounds
- Honor interaction flags, per-message caps, daily direct-message limits and an independent decay anchor.
- Linear quote masking, bounded literal matching and immutable lifecycle reduction.
- Bounded bridge deadlines with cancellation signals; late results cannot acknowledge context.
- Input, profile and snapshot limits; oversized snapshots do not replace the last valid file.
- Preserve and validate 0.3 snapshots with explicit migration boundaries.

### Integrations and examples
- Discord parser and rule-based bot example; offline verification only.
- Real LangChain Runnable and optional historical LlamaIndex TS Memory integration.
- Support and NPC demos, four presets, cookbook and tuning guidance.

### Validation
- Local behavioral, external-watchdog, randomized replay, strict typing and package-install checks.
- All seven pre-merge CI jobs passed: Node 18 core and Node 20/22/24 integrations on Windows and Linux. [Run](https://github.com/suking459/persona-memory/actions/runs/40737573004).
- No claim of live Discord validation, production memory accuracy, or LLM response-quality improvement.

npm publication is separate from the GitHub source update.

## 0.3.0
Visitor-only tracking, tag promotion adjustment and long-term tag freshness rules.
