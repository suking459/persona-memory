# Owner management and diagnostics

1.5.0 管理能力。doctor 只检查，不修复、不调用模型；召回解释展示本地检索过程。批量审阅与删除先预览影响，目标变化、预览过期或来源失效会拒绝执行。MCP 预览编号只属于产生它的连接，不构成用户已经批准。

## Diagnose first

```text
persona-memory-connect doctor --binding ABSOLUTE_BINDING_JSON
persona-memory-connect explain --binding ABSOLUTE_BINDING_JSON --scope project --query "language" --memory OPTIONAL_RECORD_ID
```

Use the locally installed development CLI or node tools/connect.mjs in a source checkout. npm 1.0.0 does not contain these commands.

doctor reads the configured JSON/SQLite snapshot, validates schema/dependency structure, reports pending/expired candidates and samples unusable current records. Source inspection defaults to 256 records and is capped at 1000 in the SDK. It reports truncation. It checks current filesystem access where a store exists; this does not reserve disk space or prove a future write will succeed. Missing storage stays missing. A malformed/foreign/unsupported store produces an error and an inspection suggestion, never automatic overwrite, initialization or repair.

Output contains IDs, counts, status and diagnostic codes, not memory values or credentials. Scope filtering covers the Agent's granted subjects. A consistency check is not proof of truth, a security audit or exhaustive bug freedom. In SDK use, malformed snapshot data throws; the Agent owner doctor converts store-open failure to a bounded report. No embedding service, evidence URL, host model, credential or host-native memory is tested.

explain is an explicitly local lexical diagnostic. It shows matched terms, reason flags, scores, original record/source fields, scope and omission counts. An optional in-scope ID receives validity/selection status. Missing and foreign IDs share the same unavailable response. If a current record is unselected, the tool conservatively reports not-selected-within-search-budgets; it does not invent a precise exclusion reason. Scores are not confidence or truth. When semantic retrieval is configured, this diagnostic may differ from normal hybrid recall and says semanticConsulted:false.

## Review a batch

Create a private JSON request file containing 1–32 entries:

```json
[{"id":"ACTUAL_CANDIDATE_ID","expectedRevision":1}]
```

Then preview:

```text
persona-memory-connect review-preview --binding BINDING_JSON --scope project --requests REQUESTS_JSON --decision accept --out NEW_PLAN_JSON
persona-memory-connect review-apply --binding BINDING_JSON --plan PLAN_JSON
```

Replace placeholders with actual paths/IDs. Use decision reject and optional reason to reject the whole batch instead. The first command displays original proposed values, current values and revisions, evidence IDs, source/assertion labels and quality warnings. Check the real evidence yourself: evidenceVerified remains false after approval. Allowed:false is a refusal preview, not a partially valid batch.

The second command is an explicit owner action. It verifies the same physical binding, logical subject, whole target state/revision/configuration, preview checksum and ten-minute expiry. The full batch is staged against current preconditions, then committed through the snapshot compare-and-swap path. A conflict or one invalid decision rejects the whole batch. Different proposals competing for one field cannot silently overwrite each other. Existing individual inspect/review commands remain available.

Preview plans contain private proposed/current values. File creation is exclusive; existing plans are not overwritten. Keep them private and delete/archive them according to your own retention policy. Checksums detect accidental changes, not authenticity or permission: a file owner can recompute them. A matching checksum is not permission to trust an unknown plan. New-file paths must have an existing parent directory.

## Preview deletion impact

```text
persona-memory-connect forget-preview --binding BINDING_JSON --scope project --memory CURRENT_HEAD_ID --revision CURRENT_REVISION --out NEW_PLAN_JSON
persona-memory-connect forget-apply --binding BINDING_JSON --plan PLAN_JSON
```

Preview counts field history, transitive derived fields and related pending/reviewed candidates. Samples contain at most sixteen IDs of each category and report truncation; the full deletion is not limited to the samples. Changed data requires a new preview. Other subjects are preserved. Expired current heads remain erasable.

The logical snapshot is the deletion boundary. This does not erase old backups, filesystem snapshots, host-native memory, model/provider logs or data the owner copied elsewhere. Back up only if retaining a copy is actually intended; do not assume a deletion also purges backups.

## Agent tools

Read/capture/review connections have scoped memory_doctor and memory_explain, in addition to existing reads.

Only review access exposes:

- memory_review_preview(scope, decision, requests, reason?) → previewId, original rows and precondition result.
- memory_review_batch(scope, previewId) → compact committed IDs/counts, not repeated large memory bodies.
- memory_forget_preview(scope, id, expectedRevision) → previewId and cascade counts/samples.
- memory_forget(scope, id, expectedRevision, previewId) → guarded deletion.

A preview is pure with respect to stored memory, but is kept in an ephemeral connection cache. At most sixteen plans are held, with no cleanup timer; old entries are evicted and expired ones cannot execute. Returned data is detached from the private plan. Another connection, wrong scope, expired/changed plan or capture access cannot apply it. A large multilingual preview is rejected before a write; use a smaller batch or the owner CLI. The stdio frame/result limits still apply.

The host must obtain the owner's decision. A model calling both tools does not prove human consent. Default capture mode and the independent owner CLI remain the recommended separation. These tools constrain this server, not an Agent with unrestricted shell/filesystem permissions.

Each managed apply stages a detached core and commits once. Failed persistence does not prematurely edit the live candidate pool. Awaited writes retain the connection's operation lock. Ambiguous store errors disable the connection and require inspection. SDK receipts distinguish committed data from local adoption: committed:true, requiresReload:true means a durable write happened while new local edits were retained. Agent receipts additionally mark the connection unavailable. Do not retry it as an uncommitted write.

## SDK

```js
import {diagnoseMemory,explainMemoryRecall,
  previewCandidateReview,applyCandidateReview,
  previewMemoryForget,applyMemoryForget} from 'persona-memory';

const report = diagnoseMemory(memory, {subjects:[subject]});
const preview = await previewCandidateReview(memory, {
  subject, decision:'accept',
  requests:[{id:candidateId,expectedRevision:1}],
});
// Present preview.rows and warnings to the owner before explicitly applying:
const result = await applyCandidateReview(memory, preview);
```

SDK plans bind logical identity, snapshot state/revision and configuration. They deliberately do not authenticate a caller or bind a filename; the Agent CLI adds binding/path checks, and MCP adds connection-owned IDs. Keep store/configuration objects under application control.

## Recovery and scope

For backups, cross-machine identity preservation and JSON–SQLite migration, see [Storage and backup](storage-backup.md). For default capture, owner inspection and host setup see [English integration](agent-integration.en.md) / [中文接入](agent-integration.md).

These operations have local SDK/CLI/protocol coverage. Follow-up acceptance passed five real-model lifecycle cases each for the specified Windows Codex CLI and DSH headless versions. Desktop UI and the other nine host targets remain unverified; see the [acceptance matrix](AGENT-ACCEPTANCE.md). The tests do not enable this service in everyday applications or merge their native memory.


Generated bundles now provide node owner.mjs with this binding already selected. See [daily operations](agent-operations.en.md) / [中文](agent-operations.md). This owner entry must be run separately from the capture Agent; convenience does not grant OS-level isolation.
