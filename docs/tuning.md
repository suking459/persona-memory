# Configuration and tuning

These are application rules, not universal laws of human relationships. Start with a preset, keep fixed synthetic inputs/time advancement, change one parameter class at a time and inspect false state assignments, expiry, context cost and processing time. Rule-demo wording is not evidence of better real-model outcomes.

## Presets

`createPreset('community'|'companion'|'support'|'npc', overrides)`:

- Community: chat-scoped state, four context people, daily positive gain cap 20.
- Companion: user-shared state, one context person, familiarity/trust dimensions.
- Support: chat-scoped, daily positive gain zero, social presentation off; the host supplies status/advice. Score does not control service eligibility.
- NPC: chat-scoped, separate familiarity/trust, 72-hour tag TTL.

## Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| maxMemories | 10000 | Typed records including history; overflow rejects rather than evicts lasting facts |
| stateMemoryTtlHours | 48 | State-record lifetime in hours, separate from tag TTL |
| episodeMemoryTtlDays | 90 | Episode lifetime; lasting kinds otherwise have no default time expiry |
| dailyGainCap | 30 | Daily positive affinity allowance; zero disables positive growth |
| talkDailyCap | 12 | Ordinary direct-interaction scoring count/day; mention/reply have their own values |
| perMessageCap | 8 | Absolute score-change cap per message; zero disables changes |
| decayPerDay | 2 | Elapsed-time decay toward baseline |
| decayBaseline | 0 | 0–100 decay target, not a minimum attainable score |
| attentionWindowSec | 180 | Continuation after explicit interaction; zero disables continuation window |
| botId | null | Platform bot identity, distinct from persona |
| affinityContext | true | Present relationship bands/score/hints; support defaults false without erasing profiles |
| scoreAmbient | false | Whether ambient messages can participate in configured scoring |
| tagTtlHours | 48 | Short-term tag TTL, renewed by fresh hits |
| longTermTtlDays | 7 | Downgrade threshold without new long-term evidence |
| maxInjections | 200 | Maintenance removal threshold for unpromoted short-term tags |
| maxTagsPerPerson | 16 | Tag cap per scope; excess prefers removal of old short-term tags |
| tagScope | user | Shared across chats, or explicit chat isolation; migration required when changing semantics |
| timeZone | UTC | Daily quota calendar; night-style statistics still use runtime timezone |
| maxPeople | 4 | Context people including visitors; zero selects none |
| maxChars | 700 | Unicode code-point context budget; zero outputs empty text; not tokens |
| visitorTracking | true | Track passers-by lightly; false creates ordinary profiles |
| visitorHint | true | Include eligible visitor hints |
| visitorHintMinCount | 2 | Minimum visits for a hint |
| maxVisitors | 10000 | Retained visitor cap |
| visitorRetentionDays | 90 | Inactive visitor retention |
| maxStyleFragments | 512 | Per-person fragment-count cap, not full chat retention |
| dedupeLimit | 2000 | Bounded delivery/turn deduplication; zero disables retention |
| dedupeDays | 7 | Deduplication time window |
| historyLimit | 100 | Change summaries; zero disables history |
| blockWords | [] | Excluded style fragments |
| extraRules | {} | Explicit custom literal rules; empty words disables a named rule |
| dimensions | {} | Per-dimension min/max/baseline/decay; host events update trust |

Scores stay within 0–100 even when negative changes have no daily allowance. Ordinary group messages do not all gain a point: adapters must preserve direct-interaction flags. Use counts are consumption records, not fresh evidence; preview does not count and retained turn IDs deduplicate confirmation.

Use `countTokens` with `tokenBudget` at context construction for the actual model tokenizer; core has no tokenizer dependency. English presentation may use more characters than earlier labels, so always inspect omissions and fit complete guidance.

## Resource and execution bounds

Default maxProfiles is 10000; overflow raises `ERR_MEMORY_CAPACITY`. Visitors retain recent entries at capacity. maxSnapshotBytes defaults to 64 MiB; oversized writes preserve the previous file. Hard ceilings live in `src/limits.js`.

Custom rule tables allow at most 64 groups and 512 keywords, each at most 128 characters; empty keywords fail. Extreme repetitive matching exceeding work bounds is rejected, requiring smaller input. No default health/emotion word lists are installed.

Bridge timeoutMs defaults to 30000, allowed 1–300000. Pass the supplied AbortSignal to cancellation-aware clients. No automatic retry or late success acknowledgement occurs. An arbitrary synchronous infinite callback still needs process/Worker isolation.
