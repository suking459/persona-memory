# Changelog

## 1.5.0-dev.0 — local unpublished candidate

Internal 1.1–1.5 work; npm/GitHub 1.0.0 artifacts and notices are preserved. Publication requires owner instruction and release-gate review.

- Independent policy candidate: default inferred tags and personality hints removed; host-supplied scoring, neutral bands, Unicode word observations and rewritten tag lifecycle. See [behavior migration](docs/1.5-POLICY-MIGRATION.md) and [source review](docs/1.5-ORIGIN-REVIEW.md); compatibility/version and exact copyright-file approval remain release gates.
- Scoped Agent stdio channel, eleven experimental host configuration generators, default capture plus independent owner review, refresh after external decisions, multilingual Unicode retrieval and original-language storage.
- Derived-source fingerprints and invalidation after correction/forgetting, cascade privacy, assertion categories and exact same-field proposal quality hints.
- Optional bounded semantic retrieval and explicit Ollama/OpenAI-compatible embedding interfaces with lexical fallback, cancellation, stale-result rejection and synthetic evaluation tooling. No measured real-model quality claim.
- Optional native SQLite (Node 22.13+), bounded CAS transactions, foreign-database refusal, checksummed full backups, guarded replacement and explicit logical-identity migration. JSON still supports Node 18.
- Read-only doctor, lexical explanations, whole-batch owner review previews and impact-guarded deletion. Detached staging prevents early live-state changes; compact receipts avoid post-commit output-size failures.
- SDK/types, English owner/storage guidance, Chinese/English workflows, isolated protocol and multi-environment checks. New APIs are not available in public npm 1.0.0.

- Generated fixed-binding owner entry, localized operation guides, explicit guarded project enable/undo and offline installed-entry verification. See [operation batch](docs/1.5-OPERATIONS-BATCH.md).
- Real-model lifecycle acceptance: five cases each on Windows Codex CLI 0.166.0-alpha.5.1 and DSH headless 0.2.1-rc.5, covering pending capture, independent owner review, correction, new-process recovery and guarded forgetting. See [scope and evidence](docs/AGENT-ACCEPTANCE.md).

Remaining gates: exact copyright-file approval, compatibility/version decision and owner publication approval. Unverified host entries remain experimental; source-review limitations remain disclosed. Existing attribution is retained; no all-original or exhaustive-bug-freedom claim.


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
