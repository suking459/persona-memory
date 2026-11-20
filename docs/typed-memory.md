# Typed memory: subjects, kinds and storage rules

Typed records are independent from relationship profiles: a project fact creates no person and changes no social score. Trusted callers can write explicitly; host extraction should normally produce reviewed candidates. This checkout uses schema 8; see [learning](learning.md), [retrieval](retrieval.md) and [time/storage](time-storage.md).

```js
import {PersonaMemory} from 'persona-memory';
const pm=new PersonaMemory({scope:'my-app'});
const project={type:'project',id:'project-a'};
const first=pm.putMemory({
  id:'release-requirement-1', // Stable caller ID for identical-content retries.
  subject:project,kind:'constraint',key:'release',
  value:{version:'1.0',requires:['tests','migration']},
  source:'user',evidenceId:'explicit-instruction-1',
});
console.log(pm.getMemory(first.id));
console.log(pm.listMemories({subject:project,kind:'constraint'}));
```

Run `npm run example:memory` for user, project and task examples.

## Subject and instance scope

A subject is `{type:'user'|'project'|'task',id,chatId?}`. All fields match exactly; identical IDs of different types identify different subjects. Persona/application scope isolation still applies. The library guesses neither identity nor project associations. Typed-record chat scope is explicit and does not change implicitly with social `tagScope`.

`listMemories` requires one complete subject. An absent `chatId` selects shared records for that exact subject; it does not mix in channel-specific rows, or vice versa. Subject selection is not authorization.

## Kinds and lifetimes

| Kind | Intended content | Default lifetime |
| --- | --- | --- |
| preference | Explicit preference | Until replacement/deletion |
| fact | Sourced factual assertion | Until replacement/deletion |
| constraint | Project/task requirement | Until replacement/deletion |
| decision | Adopted decision | Until replacement/deletion |
| episode | Context, attempt and result of an event | 90 days |
| state | Temporary current state | 48 hours |

Per-record `expiresAt` overrides defaults: null disables time expiry, a number is a millisecond timestamp. `stateMemoryTtlHours` and `episodeMemoryTtlDays` allow zero. Expiry cannot precede creation/effective time. Lack of model use does not delete lasting records; repeated inspection does not establish truth. `source` is provenance, including for model assertions.

## Input limits

Values support null, booleans, finite numbers, strings, dense arrays and plain JSON objects. False, zero and empty strings are preserved. Limits: 16 KiB/value, 1024 nodes, depth 8, 128 entries/object or array, 8192 UTF-16 code units/string. Functions, dates, BigInt, NaN, Infinity, cycles, sparse arrays, getters, undefined and prototype-pollution fields fail explicitly.

Subject IDs, keys, record IDs and evidence IDs are nonempty strings of at most 256 UTF-16 units. Sources: manual (default), user, host, rule, model, import.

## Replacement, revisions and retries

There is one latest head per subject/kind/key. A live field is not silently overwritten:

```js
const second=pm.putMemory({
  subject:project,kind:'constraint',key:'release',replaceId:first.id,
  expectedRevision:first.revision,
  value:{version:'1.0',requires:['tests','migration','clean-install']},source:'user',
});
```

The new ID references `supersedes`; the old record retains its value/source and records `supersededBy`. Wrong subject/kind/key, stale heads and revision mismatches return `ERR_MEMORY_CONFLICT` without mutation. Future activation uses effective intervals rather than latest-head status alone.

Identical content with the same ID returns the retained record without renewing time, revision or history. Different content conflicts. Retrying a superseded ID does not reactivate it. Without an ID, a new call creates a fresh ID and still needs explicit replacement for an existing live field. An expired retained observation can be superseded in the same slot. Clocks cannot move behind the prior update.

Pruned IDs remain reserved while retained version links still refer to them. Forgetting the logical field releases those links. Deterministic object-key ordering does not collapse distinct Unicode keys. Idempotency is bounded by retained identity information, not an eternal ledger; use fresh IDs for fresh observations and bounded retry windows.

## Reads, history and deletion

`getMemory(id,{includeInactive?,now?})` defaults to an effective, unexpired, dependency-valid record. Retired experiences are excluded. `includeInactive:true` permits explicit inspection. `listMemories({subject,kind?,key?,limit?,includeInactive?,now?})` defaults to 50, maximum 1000, ordered by creation time, revision and ID. Results are detached. `getMemoryAt` provides valid-time/known-time history within retained intervals; `now` alone is not a full historical query.

`forgetMemory(id)` deletes all retained versions of the identifiable logical field and its transitive derived fields/related candidates, preventing older values from reappearing. A pruned ID can identify a field through surviving links. If neither ID nor links remain, it returns zero rather than guessing. Use a retained version from a filtered inactive-inclusive list when necessary. Preview owner deletion with [management](owner-management.md).

`deleteSubject` deletes the exact typed subject without guessing related identities or deleting separate social profiles. `deleteUser` also removes typed user records; chat-specific deletion preserves unscoped/shared user records. Identically named projects/tasks are unaffected. References hidden inside arbitrary JSON and external copies remain the host's responsibility. `clear` removes the whole instance; persist after deletion.

## Capacity and migration

`maintain` removes expired records and reports `memoriesExpired`; retained superseded versions never automatically become current. `maxMemories` defaults to 10,000, hard maximum 100,000, including history. Overflow raises `ERR_MEMORY_CAPACITY`; valuable lasting records are not silently evicted. Replacement also needs room for its new version.

`diagnostics().memories` counts records. Filtered `history({subject})` stores change summaries, not value bodies. Whole snapshots also obey `maxSnapshotBytes`; a failed oversized write preserves the previous file.

Schema 1/2 migrate with no typed records; schema 3 immediate-replacement semantics map to explicit intervals. Later schemas add candidates, dependencies, origins and experience metadata. Schema 8 validates all content, head uniqueness, version links, graph structure and capacity before replacing state. Missing nodes can reflect pruning, but surviving references must agree on slot/revision/chronology. Hidden/accessor/symbol collection entries fail. Old clients reject newer schemas: retain pre-upgrade backups and never let old code write new files. See [migration](migration.md) and [time/storage](time-storage.md).
