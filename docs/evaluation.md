# Evaluation and optional read-only shadow analysis

## Synthetic evaluation

`npm run evaluate` runs public synthetic tag cases and a 2000-message / 100-user workload, reporting the defined precision/recall, p50/p95 processing time and heap change to project-local `.artifacts/evaluation.json`. These cover bounded rule behavior, not real chat quality or model benefit. GC affects heap deltas; they are not complete peak-memory measurements. No live chat/model data is used.

## Optional one-shot analysis

`npm run shadow -- --source <file>` is a manual external analyzer, not a QQA plugin, resident service or message sender. It does not modify QQA files/configuration/state.

Input: normalized JSON array or NDJSON with chatId/userId/text/millisecond ts, optional eventId/mentionsSelf/replyToSelf/directedToBot. Maximum 16 MiB / 10000 rows. Unknown native QQA formats require verified read-only conversion first; they are not automatically supported.

Prefer authorized read-only snapshots/bounded exports. Only the selected input is read. Identities are temporarily hashed in memory and output contains counts/diagnostic aggregates, fixed at project-local `.shadow/summary.json`. Original text, identities and private output never enter release packages. Shadow previews do not count as production model use or alter the original bot's records, so they cannot prove that the real bot consumed context or improved its replies.

Historical observation: no running QQA connection or chat-reading task was started. A project-owned snapshot had 508 profiles and nine tags; five single-hit tags were under three days old, insufficient to claim promotion was stuck. Private aggregate evidence: `.artifacts/snapshot-audit.json`, without identities/text. Any later real-data analysis needs a concrete question and authorized input; do not install QQA collection plugins speculatively.

## Actual outcome measurement

Define the question first: negation errors, timely expiry or context budget, for example. Use anonymized labels and report rule quality, reliability and model experience separately. Without labels or a controlled comparison, do not invent an improvement percentage.
