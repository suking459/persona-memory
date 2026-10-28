# Changelog

## 0.4.0 — 2026-10-29

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
- Cross-platform CI is the release gate; its actual result is reported separately.
- No claim of live Discord validation, production memory accuracy, or LLM response-quality improvement.

npm publication is separate from the GitHub source update.

## 0.3.0
Visitor-only tracking, tag promotion adjustment and long-term tag freshness rules.
