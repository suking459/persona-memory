# Write quality and corrections — 1.2 local development

中文概览：派生记忆显式引用来源；来源更正或过期后不再召回旧归纳，遗忘会级联清理相关历史和候选。重复/不同值提示只帮助审阅，不自动判真。当前未发布。

## Explicit sources for derived memory

A summary or experience may cite 1–16 approved records in the same subject:

~~~js
const subject = {type: 'project', id: 'work'};
const basis = pm.putMemory({
  subject, kind: 'preference', key: 'language', value: 'English',
  source: 'user', assertion: 'explicit', evidenceId: 'user-message'
});
const proposed = pm.proposeMemory({
  memory: {
    subject, kind: 'fact', key: 'summary', value: 'The project uses English.',
    source: 'model', assertion: 'inferred', evidenceId: 'summary-task',
    derivedFrom: [{id: basis.id, revision: basis.revision}]
  }
});
console.log(pm.inspectCandidate(proposed.id));
const accepted = pm.acceptCandidate(proposed.id, {expectedRevision: proposed.revision});
~~~

The library calculates content and logical-field fingerprints. Supplied fingerprints must match; source labels or high model confidence cannot bypass scope or review. Pending proposals are not citation sources.

Normal get/list/search/context/experience reads omit a derivative when a source is missing, changed, inactive or no longer valid. Transitive sources are checked, up to depth 8, 128 distinct records and a bounded traversal. Cycles and cross-subject references are rejected. No inference model or unbounded graph maintenance runs.

Scheduled corrections keep the old derived interval valid until activation. Historical queries validate references at the requested retained interval; missing/pruned history cannot be reconstructed. Source expiry caps derived retention. Context confirmation does not credit an old derivative after its source changes.

Use memoryStatus(id) to inspect usability; includeInactive reads are for explicit owner inspection and can show stale content. Correct/rebuild a derivative through a fresh reviewed proposal; the library never silently rewrites its content.

## Forgetting and export

previewForgetMemory(id) returns the record/candidate IDs affected by forgetting a logical field. forgetMemory(id) removes that field's retained versions, transitive derived fields and their histories, and related candidates. Logical-field fingerprints preserve the link even after multiple source versions were pruned. Review the impact before calling it.

Only registered dependencies can be followed: a manually copied, unlinked phrase is not automatically detected or semantically erased. All registered references must stay in the same subject. The Agent review capability remains owner-only; permission hints do not prove a human approved an operation.

A full snapshot preserves dependencies. The current portable records format cannot remap linked graphs and therefore explicitly refuses live derived records, rather than exporting them as independent facts.

## Claims and evidence

Optional assertion values distinguish explicit requests, observations, inferences and external reports:

| Tag | Meaning |
|---|---|
| explicit | Reported as an explicit requirement or statement |
| observed | Reported as an observation |
| inferred | Inference or interpretation |
| external | Report from an external source |

The tag describes a claim. It does not authenticate a source, grant authority or verify truth. New Agent proposals without a tag default to inferred; SDK records may retain an unspecified tag for compatibility. Owner acceptance does not turn an inference into a verified fact. Actual host-verified task experience remains a separate, explicit host API.

Evidence IDs are bounded references, not proof the referenced message exists. The host supplies the real event/message ID, and the owner checks it. The library does not read chats, files or accounts to manufacture evidence.

inspectCandidate(id, {limit: 16}) provides exact same-field value hints, including similar proposals, competing values and source changes. Results are bounded (limit 1–32), scoped to that logical field and do not auto-merge, auto-reject or rank truth by confidence. Different-key contradictions, translated equivalents and natural-language negation need host review; this is not semantic contradiction detection.

The extraction bridge accepts assertion and derivedFrom, while retaining the host eventId and fixed model/rule source. It cannot cite another subject or mark an experience verified. Agent proposals and the independent owner inspect command expose the same quality hints.

## Snapshot and migration boundary

Local 1.2 writes schema 6 and reads schemas 1–5 through validation. Constructors do not rewrite old files merely by opening them. Stop writers and back up the old snapshot before an actual upgrade. Older libraries cannot read schema 6; do not point an old reader/writer at an upgraded file.

Portable bundles without assertion metadata retain version 1. When assertion is present, version 2 preserves it; old version 1 cannot smuggle the new field. Derived graphs still require full snapshots or explicit re-derivation.

These changes are local development, not a published 1.2 release. Current host verification and historical copyright boundaries remain as described in [Agent integration](agent-integration.en.md).
