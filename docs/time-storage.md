# Temporal versions, storage and transfer

Run `npm run example:time-storage`. See [typed records](typed-memory.md), [retrieval](retrieval.md), [learning](learning.md) and [full backup](storage-backup.md). Local snapshots use schema 8; historical schema numbers below describe when capabilities were introduced.

## Evidence, effective time and retention

| Field | Meaning |
| --- | --- |
| observedAt | Host-reported evidence time, no later than creation; not proof that the system stored it then |
| createdAt | Time this instance created the version |
| updatedAt | Knowledge time of creation or later replacement |
| validFrom | Explicit effective start; defaults to write time |
| validUntil | Next effective start, exclusive; null for the final head |
| expiresAt | Retention/use deadline; null disables time expiry; distinct from real-world factual validity |

All timestamps use milliseconds. These fields express records and caller assertions, not truth verification or inferred natural-language dates.

```js
const project={type:'project',id:'planner'};
const old=pm.putMemory({subject:project,kind:'fact',key:'channel',value:'preview'});
const scheduled=pm.putMemory({subject:project,kind:'fact',key:'channel',value:'stable',
  validFrom:activationTime,replaceId:old.id,expectedRevision:old.revision});
```

Before activation, default reads/search/context select the old effective value; at the boundary they select the scheduled one. No timer must mutate state. Default state/episode TTL starts at `max(write time,validFrom)`, preventing expiry before activation. Context includes effective intervals in its complete budget.

`status:'current'` means latest submitted head, not necessarily effective now. A superseded prior version may still apply. Use an inactive-inclusive subject/kind/key query to find the latest head when updating schedules. Existing live fields need `replaceId`; `expectedRevision` compares the head (zero for new fields). Identical-ID retries are pure; changed content/stale revisions conflict. Effective starts cannot move behind the latest registered interval. There is no arbitrary historical insertion, branch merge or automatic source-trust selection.

## Retained historical queries

```js
const record=pm.getMemoryAt({subject:project,kind:'fact',key:'channel',
  at:effectiveTime,knownAt:knowledgeTime});
```

Known time defaults to the current clock and cannot exceed it. A correction learned at 2000 with effective time 1500 is not visible at knownAt 1800, but can be visible at 2000. Unknown later replacement links/end times are hidden. A future `at` inspects registered plans rather than predicting facts.

Only retained intervals can be queried. Expiry/version pruning may yield null; null is not proof that a historical value never existed. Expiry is evaluated at known time, and physically removed data cannot be recovered by setting an earlier timestamp. Version capacity is bounded; active/future intervals are not silently pruned. Conflicting or ambiguous retained chains fail rather than being guessed into completeness.

## Snapshots and migration

Import validates before replacing memory. Schemas 1/2 retain legacy social semantics; schema 3 immediate replacements map to `validFrom=createdAt` and prior `validUntil=updatedAt`; schema 4 retains explicit intervals; schema 5 adds candidates/host experience; schema 6 dependencies, schema 7 origins, schema 8 reviewed/model experience and lifecycle metadata. New-field gates reject a lowered version header. Preserve old code and pre-upgrade snapshots for rollback; old clients must not write new data. Ambiguous old chains may require explicit host repair on a copy.

## JSON store and concurrent writes

`new PersonaMemory({storage:'./data'})` and synchronous `flush` remain supported. Each file has an expected content revision. Under an exclusive `.lock`, the writer checks the revision, writes/fsyncs an owned same-directory temporary file and renames it into place. Stale writers receive `ERR_STORE_CONFLICT`; no automatic merge/retry loop runs.

```js
try { pm.flush(); }
catch(error) {
  if(error.code!=='ERR_STORE_CONFLICT')throw error;
  // Inspect local edits first. This explicitly discards them:
  await pm.reload({discardChanges:true});
}
```

`ERR_STORE_LOCKED` does not automatically steal a seemingly old lock. After process failure, confirm the writer is stopped before recovery. Only successfully created owned temporary files are cleaned; collisions do not delete another writer's file. Strong process termination can leave owned temporary files/locks. Actual local Windows/Linux competition and termination tests are documented in [hardening](1.0-HARDENING.md); they do not certify network filesystems, editors ignoring locks or arbitrary old writers. Identical bytes have identical revisions: the hash is not a global event sequence.

Regular-file, no-link/device/FIFO and strict UTF-8 validation applies. Actual read bytes remain bounded even if the file grows after stat. Node exclusive-open and rename behavior is described in [fs documentation](https://nodejs.org/api/fs.html); this is not a database transaction, directory-level power-loss guarantee or Windows ACL manager. In tested Node permission mode, fsync is denied, so JsonFileStore fails and cleans its temporary file rather than pretending success. Use a compatible host store or MemorySnapshotStore where appropriate.

## Asynchronous store contract

```js
import {PersonaMemory,MemorySnapshotStore,JsonFileStore} from 'persona-memory';
const store=new MemorySnapshotStore(); // Shared in this process only.
const pm=await PersonaMemory.open({store,persona:'assistant',scope:'app'});
pm.putMemory({subject:{type:'task',id:'t'},kind:'decision',key:'step',value:'check'});
await pm.persist();
await pm.reload();
```

A store implements `read():Promise<{snapshot,revision}>` and `write(snapshot,{expectedRevision}):Promise<{revision}>`. Empty storage is null/null; successful write returns a nonempty revision string. The actual backend must atomically compare and commit; separate read-then-write is insufficient. Core validation cannot implement external-store CAS for the host. JsonFileStore's async methods wrap synchronous disk operations. Optional native [SQLite](storage-backup.md) is a separate backend.

Only one persist/reload may be in flight (`ERR_STORE_BUSY`). Persist captures the initial snapshot; edits while awaiting remain dirty for a later save. Reload refuses replacement if local state changes while waiting. Storage failures preserve local edits and do not automatically retry. Arbitrary external-store timeout/cancellation is the host's responsibility. `flush` on async-only stores raises `ERR_STORE_ASYNC`; synchronous `maintain` needs a later persist.

Bridges/HTTP/MCP await persistence; bridges recheck deadlines before model calls. A valid snapshot already submitted to a store may commit after model timeout: timeout is not storage rollback. Local mutation and durable commit are separate stages.

`reload({ifChanged:true})` still validates the store response. A clean instance with the same revision retains existing state and ephemeral contexts/previews. Changed revisions perform full validation/reload and invalidate old previews. Default reload still resets them. Dirty/busy checks remain; `discardChanges:true` is explicit and not skipped. Custom revision tokens must identify content, not merely mtime/size. There is no implicit merge or retry.

## Selective transfer

`exportMemories` carries explicitly selected currently effective values, not social state, chats, use counts, candidates, schedules or a full version graph. It does not synchronize later source changes. Full recovery uses snapshot backup with the original identity.

```js
const bundle=source.exportMemories({subject:{type:'project',id:'source'},kinds:['constraint','decision']});
const preview=target.previewMemoryImport(bundle,{mappings:[{
  from:{type:'project',id:'source'},to:{type:'project',id:'destination'}}]});
console.log(preview.counts,preview.rows);
// Inspect the plan before allowing updates.
target.applyMemoryImport(preview.planId,{allowUpdates:true});
await target.persist();
```

Every subject needs an explicit mapping, even identically named ones. Destination IDs derive from source entries and mapping; source IDs are provenance. Values/source/evidence/time remain data rather than authorization. Identical repeats are `same`. Expired/future incoming values, scheduled target heads, incomplete target history, corrected prior imports and mapped-slot collisions are conflicts.

Any conflict rejects the whole batch. Updates require `allowUpdates:true`; capacity/revision failures never half-apply. Plans last ten minutes, are ephemeral and invalidate after typed-memory changes. Deletion/clear releases affected pending imported values. Limits: 1000 rows, 4 MiB, 32 mappings; at most 128 plans / approximately 8 MiB pending data. Import work is capped by `(existing records + incoming rows) * incoming rows <= 2,000,000`; use smaller batches beyond that. HTTP retains its smaller 1 MiB request cap.

Portable versions 1–3 support their explicitly gated metadata. Derived records require full backup or explicit re-derivation, never silent dependency removal. Selective experience text does not transfer host verification authority; retired records are excluded.

## Interfaces and references

HTTP `/api/memory/at` is read-only. Export/import-preview/import-apply require explicit admin access plus existing Bearer/Origin checks. Legacy MCP exposes read-only `memory_at`; transfer writes are not automatically granted to a model. Subject selection is not a fine-grained ACL.

[Zep facts](https://help.getzep.com/facts) informed the distinction between applicability and recording time, which does not authenticate facts. This project's explicit-time/bounded-history implementation does not include Zep's graph database or automatic date inference. See [0.8 history](0.8-AUDIT.md), [hardening](1.0-HARDENING.md) and current milestone validation for measured boundaries.
