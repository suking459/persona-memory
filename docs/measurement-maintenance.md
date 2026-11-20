# Local measurement, comparisons and bounded maintenance

Unpublished 1.9 development. No new snapshot schema: schema 8 remains. Neither collection nor maintenance starts automatically. Core remains dependency-free and no model/provider is contacted by these APIs.

## Actual host flow

1. Instrument a completed host operation using its real clock/counters. Do not ask a model to guess elapsed time, tokens or success.
2. Submit fixed scalar fields to a local meter or memory_measure. Inspect memory_metrics for this connection/scope; restart intentionally loses these ephemeral samples.
3. For on/off comparisons, record one completed enabled and disabled trial for each numeric case index under the same externally documented host/model/configuration/task. The comparison utility checks structure/pairing, not experimental equivalence or truth.
4. Before cleanup, an owner previews a chosen subject, inspects impact/skipped reasons, then explicitly applies the plan. No automatic loop drains a backlog.

Host-native permissions still apply. Capture cannot invoke owner maintenance tools; shared owner commands require a review grant. A preview is not human approval.

## Scalar metrics

```js
import {createMemoryMetrics,compareMemoryTrials} from 'persona-memory';
const metrics=createMemoryMetrics({capacity:128});
metrics.record({operation:'context',durationMs:4.2,success:true,bytes:1200});
console.log(metrics.summary());
console.log(compareMemoryTrials([
  {caseIndex:0,mode:'enabled',durationMs:25,success:true,inputTokens:200},
  {caseIndex:0,mode:'disabled',durationMs:20,success:true,inputTokens:250},
]));
```

The numbers above are synthetic API examples, not measured project benefits. Operations: recall, context, proposal, review, persist, maintenance, task. Capacity defaults to 128, allowed 1–1024. The ring drops the oldest retained sample; summary counters identify total/retained/dropped. Per-operation aggregates refer only to the retained window, including failed observations. Samples are detached copies; clear resets the ring and counters. Duration is finite 0–86400000 ms; token/byte counts are integers 0–1000000000. Counter exhaustion requires explicit reset.

Only operation/duration/success and optional inputTokens/outputTokens/bytes are accepted. No query/body/value/evidence/user/error-message/tool-argument fields or callbacks are retained. Explicit locale/source-language memory remains separate. Missing token/byte values are null in aggregate results unless every retained sample supplied that field; known counts show coverage. No character-to-token estimator, price calculation, savings claim or statistical inference runs. Values are marked caller-reported and evidenceVerified:false.

Agent memory_measure accepts the same scalar fields plus granted scope. memory_metrics is read-only. Each bound scope has its own fixed-capacity connection-local meter; it is not persisted, sent to telemetry or shared with another client. Ordinary calls do not automatically become metric samples. Revoked/expired grants are checked before either tool.

## Paired comparisons

compareMemoryTrials accepts at most 256 rows with caseIndex 0–1000000000, mode enabled/disabled and completed scalar observations. Duplicate case/mode rows fail rather than silently inflating counts. Unpaired cases are reported and excluded from paired summary. Deltas are enabled minus disabled; either-side unknown tokens/bytes remain null. Outcomes are caller reports, not verified task quality. Keep actual experiment metadata/evidence outside this scalar utility and never encode personal identity into case indices.

```sh
persona-memory-connect compare-trials --input trials.json --out comparison.json
```

No binding is required. Input is a regular strict-UTF-8 file capped at 64 KiB; output is an exclusive new file. `npm run example:measurement` actually times a small synthetic local context construction with/without memory. Its success flag means construction completed, not a model task succeeded; it makes zero model calls and reports unknown token counts. Do not market its timings as LLM quality gains.

## Maintenance preview and apply

```js
import {previewMemoryMaintenance,applyMemoryMaintenance} from 'persona-memory';
const plan=await previewMemoryMaintenance(pm,{subject:{type:'project',id:'work'},limit:16});
// Inspect targets, impact and skipped reasons, then obtain the owner's decision.
const result=await applyMemoryMaintenance(pm,plan);
```

Generated owner entry:

```sh
node owner.mjs maintenance-preview --scope project --limit 16 --out maintenance-plan.json
node owner.mjs maintenance-apply --plan maintenance-plan.json
```

Agent review tools: memory_maintenance_preview and memory_maintenance_apply. The returned previewId is connection/scope-bound, detached and consumed by apply. Changed state, configuration, revision, invalid timing or permission requires a new preview. CLI plans bind the exact normalized binding. Plans last ten minutes; checksums detect alteration rather than authenticate authors.

Eligible objects are expired candidates or expired, already-effective latest record heads in the exact subject. An expired historical row cannot select a newer valid/future head. Forgetting a selected head includes retained field history and explicitly registered derivative fields/candidates; if any affected record is still usable, the target is skipped. Apply rechecks current-time usability so a scheduled descendant becoming active since preview is protected.

Bounds: at most 5000 records and 5000 candidates in the snapshot, 1–32 queue entries considered/call (default 16), and 512 total affected records/candidates. Excess global scan size fails explicitly; excessive cascade impact skips that target. No backfill loop searches indefinitely for removable objects. remaining means unconsidered queue entries at preview time, not an exact post-cascade backlog. Skipped entries are not automatically retried; inspect/manage them explicitly.

The plan contains counts, bounded ID samples and reasons, not memory bodies. Data changes stage in a draft and reuse full-snapshot backup/restore CAS for one commit. Failures preserve current memory and the prior valid durable snapshot; concurrent local edits can produce an explicit committed/reload-required receipt under the existing contract. An empty plan returns committed:false and performs no write. This is distinct from legacy unscoped maintain; social data is not swept by this new scoped operation.

## Owner output files

Management plans, full backups, restore plans and handoff exports must be new files outside the bound memory store. Existing ancestor/link resolution also rejects aliases and root-boundary cases. This prevents a plan/backup from occupying an absent snapshot filename and making an empty store unloadable. No existing file is overwritten. Trusted local filesystem permissions remain required; this is not protection against arbitrary hostile OS access.

## Evidence boundary

Tests cover scalar-only retention, getters/numbers/caps/unknown values, pairing, scope/connection roles, actual MCP and independent owner processes, changed/expired plans, valid/future/history protection, dependency cascades, scan/impact limits, writer races and persistence failure. Cross-environment results are recorded separately in the 1.9 validation report. No new real-model benefit score or additional vendor-host acceptance is implied. Public releases still require separate approval.
