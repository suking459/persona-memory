# API and data semantics

This checkout uses snapshot schema 8 and reads schemas 1–7. Published 1.5.0 uses schema 6; local 1.6–1.8 additions are unpublished. `index.d.ts` defines the public types. Rules can also be imported as pure functions.

## Typed memory

`putMemory`, `getMemory`, `listMemories`, `forgetMemory` and `deleteSubject` manage explicit user/project/task records separately from relationship scores. `searchMemories` and `buildMemoryContext` select approved current records; they do not inject records into the relationship-only `buildContext`. `confirmContexts` can atomically acknowledge overlapping record and relationship contexts. See [typed memory](typed-memory.md), [retrieval](retrieval.md) and [temporal storage](time-storage.md).

A record has one of six kinds, a subject, a logical key, bounded JSON value, provenance, timestamps and revision information. Explicit replacement and expected revisions prevent stale updates. `status:'current'` identifies the latest head; effective-time queries determine which version actually applies. Source labels are provenance assertions, not confidence probabilities or independent evidence authentication.

## Construction and scope

```js
new PersonaMemory({storage, persona, scope, config, clock});
```

- `persona` defaults to `default`; it is distinct from `botId`.
- `scope` defaults to the empty application scope. Nonempty scope filenames use a digest of scope and persona.
- `config.tagScope:'user'` shares tags/visitor state for a user within an instance, while relationship scores remain keyed by chat and user. `chat` also isolates tags/visitors by channel.
- Applications explicitly supply identity and authorization. Adapters do not guess cross-platform identities.
- `clock` defaults to `Date.now`; timestamps use milliseconds. Controlled clocks support replay and tests.
- Null storage is in-memory only. JSON locking and revisions reject conflicting writes. Custom store atomicity remains the host's responsibility.

## Ingestion

`ingest({chatId,userId,text,ts?,eventId?,mentionsSelf?,replyToSelf?,directedToBot?,mentions?,replyTo?,isSelf?})` records an interaction. Explicit self-mention/reply flags take precedence over inferred `botId` matches. `directedToBot` supports direct conversation without mentions; an explicit interaction opens a bounded `attentionWindowSec` continuation window.

Ambient messages do not score by default. Default independent policy has no built-in emotion/health word list; hosts supply judgments or explicit custom rules. `scoreAmbient` changes which messages are eligible, not whether unknown text is true. Event deduplication is bounded by `dedupeDays`/`dedupeLimit` and scoped by chat/user. Older timestamps return `ignored`; they do not reset daily allowances. Without an event ID, duplicate delivery need not be detected.

The result includes `matched`, actual `delta`, `reasons` and optional tag/visitor/duplicate/ignored details. Self messages are ignored and do not become human style samples.

## Context preview and confirmation

```js
const context = pm.buildContext({chatId:'room',userIds:['a','b'],priorityUserIds:['b'],budget:700,maxPeople:4});
const text = pm.buildBlock({chatId:'room',userIds:['a']});
// Confirm only after actual successful use.
pm.confirmContext(context,{turnId:'unique-turn-id'});
pm.flush();
```

Selection prioritizes explicitly named people, then recent activity and score. Only requested users are considered; visitors count toward the people limit. Budgets include the complete label and advice. Whole items are omitted rather than truncated into misleading partial guidance. Display controls are sanitized; source content remains untrusted data. State advice takes precedence over generic relationship hints. `affinityContext:false` omits social score/tier presentation; the support preset uses this setting. `getProfile` still exposes the stored score.

Character budgets count Unicode code points, not glyphs or tokens. Exact token budgets require both `tokenBudget` and a real `countTokens(text)` callback. JSON HTTP/MCP arguments cannot carry that callback. Previews do not mutate exported state or increment injections. At most 128 ephemeral confirmation credentials are retained for ten minutes; they do not survive restart. A retained turn ID counts once, and replaced/removed evidence invalidates old confirmations.

## Tags and host events

```js
pm.setTag({chatId:'room',userId:'a',tag:'job-search',source:'host',eventId:'case-1'});
pm.setTag({chatId:'room',userId:'a',tag:'employed',source:'host',replace:['job-search']});
pm.removeTag({chatId:'room',userId:'a',tag:'employed'});
pm.recordEvent({chatId:'room',userId:'a',type:'promise-kept',eventId:'quest-1',changes:{trust:10}});
```

Advice is a string of at most 2000 UTF-16 code units; updating a tag replaces its advice. Null expiry marks host-selected long-term state, still subject to evidence freshness. `builtin`/`extra`, `host`/`manual` and `model` describe origins rather than certainty. `recordEvent` accepts only enabled dimensions; hosts must verify and authorize the actual event. Dimensions are optional; they do not infer trust from praise.

## Reads and deletion

`getProfile`, `getVisitor`, `listVisitors`, `diagnostics` and filtered `history` return detached data. Chat-scoped visitor reads require `chatId`. `deleteUser` removes the user's relationship state, tags, visitors, use records and diagnostics in this instance; a chat-specific deletion preserves user-shared tags when other chats still refer to the user. `clear` clears the instance. Persist afterwards. None of these operations retract external logs, old model contexts or independent backups.

## Persistence and maintenance

`maintain(now?)` applies elapsed-time decay, evidence-based tag lifecycle and retention limits; JSON storage flushes, whereas asynchronous storage requires `persist`. Its result includes expired memory/candidate counts. Maintenance does not pretend to be a new real interaction. Tag expiry and promotion policy is documented in [tuning](tuning.md); repeated model exposure is not fresh factual evidence.

`export` returns a detached schema 8 snapshot. `import` validates fully before replacing state and requires compatible persona/scope/storage semantics. Invalid or unknown-version files fail without being overwritten. The host may explicitly recover or continue without memory while preserving the failed file.

Snapshot validation rejects getters, `toJSON`, sparse arrays, hidden/symbol properties and non-JSON values, including unknown fields. It enforces configured encoded bytes, depth 32 and 2,000,000 nodes. JSON files must be regular files; links/devices/FIFOs and malformed UTF-8 fail. Bounded reading checks at most the allowed bytes plus one, including files that grow during reading. See [backup/recovery](storage-backup.md).

## Learning, handoff and sharing

Candidate APIs provide bounded proposal, revision, rejection and atomic acceptance. Pending content is not searchable as an approved fact. `recordExperience` remains a trusted host SDK entry; [experience reuse](experience-reuse.md) adds reviewed model reports, exact-version feedback, conditional eligibility and owner retirement. Approval alone never verifies a model report.

[Handoffs](handoff.md) carry bounded checkpoints and revalidated references rather than copied memory values. [Shared spaces](sharing.md) use explicit local policy grants, separate stores and owner-bound origins. These local development additions do not imply remote authentication or unrestricted host certification.

## HTTP, MCP and Agent channels

The legacy HTTP service defaults to loopback port 8791. `PM_TOKEN` enables Bearer authentication; writes require JSON, and management writes require `PM_ALLOW_ADMIN=1`. Storage variables include `PM_STORAGE`, `PM_PERSONA` and `PM_SCOPE`. Never commit real credentials.

Host must match a loopback name/address and actual port. POST Origin must match the local HTTP endpoint. A reverse proxy must rewrite the backend Host appropriately; Host/Origin checks do not replace application authorization. HTTP, CLI and MCP reject malformed UTF-8. MCP stdio processes sequentially, respects stdout backpressure, bounds pending input to 1 MiB and accepts a complete final message without a newline.

The legacy MCP offers relationship and typed-memory tools; it cannot guarantee complete ingestion merely because a model may call tools. The [scoped Agent service](agent-integration.md) additionally fixes subjects/access in an owner binding and defaults to capture with separate review. Host-native permissions and memory remain authoritative.
