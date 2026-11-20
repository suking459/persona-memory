# Reviewed learning, candidates and experience

Extraction is disabled until a host explicitly supplies a callback and credentials. There is no background learner, automatic paid request or recursive retry/summarization loop. Core memory is dependency-free.

## Propose before accepting

```js
const subject={type:'project',id:'work'};
const candidate=pm.proposeMemory({memory:{subject,kind:'constraint',key:'release',
  value:'after complete checks',source:'user',evidenceId:'request-1'},
  reason:'Explicit project requirement',confidence:0.9});
const revised=pm.reviseCandidate(candidate.id,{expectedRevision:candidate.revision,
  memory:{value:'after all required checks'},reason:'Host correction'});
pm.acceptCandidate(revised.id,{expectedRevision:revised.revision});
await pm.persist();
```

Candidates do not participate in approved retrieval or create social profiles. Source/reason/confidence labels establish neither truth nor authority. Each candidate binds the original head ID, revision and deterministic fingerprint. A later formal correction/deletion/replacement prevents stale acceptance. Revising a candidate does not refresh that base. Reload preserves it. `acceptCandidates` atomically accepts up to 32 requests; any conflict/capacity/data failure leaves no partial batch.

Pending → accepted/rejected is terminal. Identical terminal retries are pure. Acceptance returns `{candidate,record,duplicate}`; a later-pruned formal record can yield null on retry and is never recreated. Default candidate identity derives from normalized content, subject, kind, key, source, evidence and optional metadata. Identical proposals do not renew TTL or grow state and retain the first reason/confidence. An explicit ID with different content raises `ERR_CANDIDATE_CONFLICT`; this is not semantic paraphrase deduplication.

## Retention and deletion

`candidateTtlHours` defaults to 72, maximum 720. Per-call `ttlHours` allows 0–720. Revision/review does not extend the original deadline; a candidate cannot outlive the proposed record's evidence expiry. Candidate review retention and formal-record expiry are separate.

`maxCandidates` defaults to 1000, maximum 10000; `maxCandidateBytes` defaults to 4 MiB, maximum 16 MiB. Retained accepted/rejected rows count toward capacity. `maintain` removes expired rows and reports `candidatesExpired`; zero capacity/bytes disables candidate writes while permitting empty snapshots.

`forgetCandidate` does not undo accepted formal content. Field forgetting removes its history, transitive derivatives and related candidates. Subject/user deletion and clear include relevant review history and invalidate late extraction. External messages, host caches and backups remain the host's responsibility. Deduplication ends with retained identity data; deleted text must not be automatically replayed to resurrect it.

## Pluggable extractor

```js
import {createMemoryLearner} from 'persona-memory/adapters/learning';
const learner=createMemoryLearner(pm,{subject:{type:'user',id:'u'},kinds:['preference'],
  source:'model',timeoutMs:30000,maxCandidatesPerCall:16});
const result=await learner.extract({eventId:'message-1',text:'Host-provided input'},
  async({subjects},{signal})=>[{subject:subjects[0],kind:'preference',key:'format',
    value:'short',reason:'Synthetic example',confidence:0.8}]);
```

Extractor rows allow only subject/kind/key/value/reason/confidence/observedAt/validFrom/expiresAt. Host bridge settings supply source/evidence IDs: the extractor cannot grant host provenance, replacement IDs, revisions, acceptance or verification. Subjects/kinds must be constructor-bound. Raw input is not copied into snapshots or diagnostic history.

Identical event/input retries share a call; changed input fails. If extraction succeeded but persistence failed, retry reuses proposed candidates rather than calling the provider again. Returned review states are refreshed; deleted cached candidates become unavailable, never resurrected. Corrections or deletion while waiting reject late results as a batch.

Limits: input 100000 characters; default 16 / maximum 32 rows per call; deadline 1–300000 ms; at most 128 execution/cache slots. AbortSignal and a post-callback monotonic deadline check prevent late commits. Synchronous infinite callbacks require host process isolation. Candidate/automatic-acceptance memory mutation is atomic, but external persistence is a separate stage: failed storage does not roll back local memory, and a timed-out store may still commit a valid snapshot. See [storage](time-storage.md).

## Explicit bounded automatic acceptance

```js
const learner=createMemoryLearner(pm,{subject,source:'rule',
  autoAccept:{kinds:['preference'],minConfidence:0.9,maxPerCall:1}});
```

Default is off. Only allowed kinds, sufficient reported confidence, unexpired evidence and never-established target fields qualify. Existing/future/incomplete fields remain for review. Maximum eight acceptances/call, one per logical field; others have omission reasons. Proposal and acceptance stage atomically. Confidence is caller-reported, not a calibrated accuracy guarantee, and extracted text cannot expand permission. Trusted callers can also use `proposeMemories(inputs,{autoAccept})`.

## Experience

```js
const experience=pm.recordExperience({subject:{type:'task',id:'release-check'},key:'offline-method',
  task:'Check package',context:{environment:'local'},attempt:'Install offline and replay',
  result:'Synthetic cases passed',conditions:['offline','synthetic-data'],outcome:'success',
  verified:true,evidenceId:'host-run-report-1'});
pm.listExperiences({subject:experience.subject,verifiedOnly:true,outcome:'success'});
```

Trusted `recordExperience` creates an episode (default 90-day expiry) with ordinary version/correction/deletion rules. Outcomes: success/failure/mixed/unknown. Verification defaults false; true requires a host assertion, evidence ID and known outcome. It proves neither independent audit nor universal applicability. Structured task/context/attempt/result/conditions preserve the circumstances.

Verification lives in metadata, not arbitrary text saying `verified:true`. Local 1.8 adds explicitly unverified model experience candidates, reviewed feedback, exact condition matching and retirement; see [experience reuse](experience-reuse.md). Ordinary approval does not promote model claims into host verification. Candidate edits to content/evidence remove the old verification assertion. Corrections invalidate old-version feedback. Selective transfer does not transfer verification authority; full same-identity trusted backups can preserve metadata. The library schedules no tasks.

## Interfaces and validation

Legacy HTTP read routes list/get candidates and list experiences. Proposal/review/revision/deletion and direct experience recording require admin access and retain Bearer/Origin/1 MiB limits. No route remotely invokes arbitrary extractor plugins. Candidate conflict maps to 409. Legacy MCP adds read-only `memory_experiences`; the separate scoped Agent service enforces its own capture/review roles.

The review CLI takes one JSON input. Set `PM_STORAGE`, optional `PM_PERSONA`/`PM_SCOPE`; list/get show values, sources, bases and decisions. Acceptance requires `options.expectedRevision`. CLI input is data, not executable code. `npm run example:learning` needs no key; `evaluate:learning` checks four synthetic continuity contracts, not extractor accuracy or answer quality.

Schema 5 introduced candidates; later schemas add dependencies/origins and schema 8 experience candidates. Validated old snapshots migrate; changing a version header does not downgrade data. Keep pre-upgrade backups.

Design references: [LangGraph memory](https://docs.langchain.com/oss/javascript/concepts/memory) for memory categories/write timing and [LongMemEval](https://arxiv.org/abs/2410.10813) for temporal/update/abstention test dimensions. These are design references, not copied implementation or benchmark endorsement; the full LongMemEval benchmark was not run. See [historical 0.9 review](0.9-AUDIT.md) and current milestone evidence.
