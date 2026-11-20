# Reviewed memory consolidation

Combine overlapping, approved records into a proposed summary while preserving exact source revisions. Each proposal is an inferred `fact` with a `summary/` key. Review it before relying on the wording. The original records remain available. If a source is corrected, expires or is forgotten, the reviewed summary can no longer serve as current evidence.

```js
import {createMemoryConsolidator, proposeMemoryConsolidation} from 'persona-memory';

const consolidate = createMemoryConsolidator(memory, {subject: {type: 'project', id: 'release'}});
const draft = await consolidate.draft({
  evidenceId: 'release-summary-review-01',
  sources: rows.map(({id, revision}) => ({id, revision})),
}, async ({records}, {signal}) => {
  // The application supplies this callback and chooses whether to invoke a model.
  return summarizeSelectedRecords(records, {signal});
});

const {candidates} = proposeMemoryConsolidation(memory, draft);
// Review each pending candidate using the normal owner workflow and persist as usual.
```

The callback returns an array of `{key, text, reason, sourceIds}` objects. Each summary needs at least two distinct selected source IDs. Return an empty list when dates, speakers, negation or other conditions cannot be preserved. Keep those distinctions in the proposed text and check them at review. The library verifies source identity, freshness and scope. The reviewer judges whether those sources support the wording.

Use 2–32 sources from one subject and up to 16 proposals per batch. The source batch and returned proposals each have a 32 KiB JSON budget. The callback receives a cancellation signal on timeout. Late results cannot write, and source changes between drafting and proposal are detected. Explicit proposal submission is the only write step. Corrections between submission and review are detected again at acceptance. Rejected proposals remain subject to the ordinary candidate lifecycle.

## Agent MCP

1. Recall approved records in one allowed scope and select current IDs with revisions.
2. Call `memory_consolidation_sources` with `{scope, sources}`. It returns the exact records and fingerprints. It is available to read bindings.
3. Call `memory_consolidation_propose` with `{scope, sources, evidenceId, summaries}`, reusing the returned source references including fingerprints. Capture or owner access is required. Shared scopes keep their existing lease and write rules.
4. Review separately with the [owner workflow](agent-integration.md). A capture binding cannot approve its own proposals.

Consolidation works on task-memory records. The [casual-chat character](character.md) calculates its own preferences directly from observations.
