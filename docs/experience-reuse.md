# Reviewed experience reuse / 经验复用

Local 1.8 development; no background task, model request, host settings change or automatic execution. Requires schema 8 for experience candidates, unverified model experiences and lifecycle metadata. Older snapshots (1–7) remain readable; older clients cannot read schema 8. Back up before upgrading.

## Host workflow

1. Propose an experience using `memory_experience_propose`: task, context, attempt, result, outcome, explicit condition labels and an actual evidence reference. It is pending until an owner reviews it using the existing candidate tools.
2. Before reusing a procedure, call `memory_experience_reuse` with the current condition labels. Generic recall/context returns approved data; it is not a procedural recommendation. Neither interface grants permission to perform a task.
3. After a real attempt, propose `memory_experience_feedback` with the exact current experience ID/revision, trial ID, evidence ID, condition labels and outcome (`helped`, `not-helpful`, `failed`, `not-applicable`). Review this candidate separately.
4. Owner review access is required for `verified:true`, feedback `attest:true` and `memory_experience_retire`. Retirement and reinstatement create candidates; neither takes effect until separately reviewed. Reinstatement does not restore verification.

Capture clients can propose model reports and reported feedback. Accepting a candidate does not change its source or turn model self-assessment into host verification. Owner attestation is still the caller's assertion: the library does not open evidence links or verify reality. Every reuse result returns `evidenceVerified:false` and `taskExecuted:false`.

条件是调用方明确填写的标签，按原文严格比较，不做翻译、同义词归并或自然语言推断。经验必需条件是当前条件的子集；反馈条件须与当前条件的集合完全一致。标签可使用中文、日文、阿拉伯文等原文，但“能存储”不等于跨语言语义等价。缺少标签时不会声称对应环境已验证。

## Interpretation

- `eligible`: condition labels match, no relevant adverse or invalid feedback was found, the scan completed within bounds, and there is either an explicit host-verified success or owner-attested helpful feedback for this exact version/context. It does not guarantee success.
- `needs-review`: reasons explain missing conditions, absent confirmed success, adverse verified outcome, counterevidence, invalid feedback or a capped scan.
- Counted feedback is deduplicated by connected groups of trial IDs **or** evidence IDs, including transitive collisions. Repeated submissions cannot increase success counts. Owner-attested feedback takes precedence over reported feedback within a group. Conflicting attested outcomes remain visible and require review.
- Different evidence for the same trial occupies a separate feedback field, so it cannot silently erase the bridge used for deduplication. Conflicting feedback can be explicitly corrected or forgotten through ordinary owner management; no automatic reconciliation rewrites evidence.
- Negative feedback applies to its exact condition set. It does not globally retire the method. A verified failure/mixed outcome on the experience itself requires review even if positive feedback exists.
- At most 1000 current episode records and 32 experiences are inspected per call; return limit is 1–32. At a scan cap, all returned experiences require review. No accuracy percentage is invented from these counts.

## Retirement, correction and transfer

Retirement is a new host-sourced version in the same logical field with `experience.retired:true`, `verified:false`, evidence and an explicit reason. Ordinary recall, context, time-current queries and derived dependencies exclude it. Earlier valid versions remain available through explicit historical queries; retirement is not deletion. Reinstatement creates another unverified version. An expired or scheduled head cannot be revived through this shortcut.

Feedback uses ordinary `derivedFrom` fingerprints. Correction, expiry, retirement, forgetting or dependency invalidation prevents old feedback from supporting new/current conclusions. Same-identity snapshot backup/restore preserves this graph. Selective portable export refuses derived feedback rather than removing its dependencies. As before, selective export of standalone experience text **does not transfer host verification authority**; retired records are excluded.

## SDK and local owner command

Root exports: `proposeExperience`, `proposeExperienceFeedback`, `proposeExperienceRetirement`, `reuseExperiences`. The original `recordExperience` remains available for trusted SDK callers. An SDK caller can assert host labels; the SDK is not an authentication service.

Generated owner entries support the following commands. `--input` points to a regular UTF-8 JSON file of at most 64 KiB containing the corresponding tool arguments **without** `scope`; aliases are fixed by the binding.

```sh
node owner.mjs experience-propose --scope project --input experience.json
node owner.mjs experience-feedback --scope project --input feedback.json
node owner.mjs experience-reuse --scope project --input conditions.json
node owner.mjs experience-retire --scope project --input retirement.json
```

`conditions.json`: `{"conditions":["Linux"],"includeNeedsReview":true}`. Lifecycle input: `{"id":"ACTUAL_ID","expectedRevision":1,"evidenceId":"ACTUAL_DECISION","reason":"Explicit owner reason","retired":true}`. Feedback attestation uses `attest:true` in the Agent/CLI, or `verification:'owner-attested'` in the trusted SDK.

Private owner commands use the existing separate owner-review boundary; shared owner commands retain the granted policy role and never elevate capture to review. Shared operations stamp policy-assigned origin and serialize with revocation. This remains a trusted local-filesystem boundary, not protection against an Agent already granted arbitrary filesystem access.

SDK, CLI and MCP subprocess tests are separate from real host/model acceptance. These additions have no new Claude Code, WorkBuddy, Codex or DSH live-model certification; do not treat generated configurations as completed host integration.
