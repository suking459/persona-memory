# Upgrade and rollback

Confirm the installed version/channel before upgrading. GitHub and npm are separate publication channels. Published 1.0 uses schema 5; published 1.5 uses schema 6; this local 1.8 checkout uses schema 8 and reads schemas 1–7. See the [1.5 policy migration](1.5-POLICY-MIGRATION.md) for changed defaults and [experience reuse](experience-reuse.md) for local schema 8 additions.

## Upgrade steps

1. Stop all old writers for the same store. Back up original data and the old code/package.
2. Open a backup copy using the same persona, scope and tagScope. Inspect profiles, typed records and time intervals.
3. Persist the new format only after successful validation, keeping an independent pre-upgrade backup.
4. Switch the application. Corrupt, ambiguous and unknown formats fail explicitly; never replace them with empty state.

Schema 1 defaults to user-shared tags. Changing tagScope/scope requires explicit migration rather than copying shared tags into every channel. Empty scope retains legacy persona naming; nonempty scope uses a combined digest. Schemas 1/2 start with empty typed records/candidates; schema 3 immediate replacement maps to effective intervals; schema 4 retains intervals, schema 5 adds candidates/host experience, schema 6 dependencies, schema 7 origins and schema 8 reviewed/model experiences/lifecycle. Field gates prevent downgrading by editing a header.

## Behavioral checks

- Context APIs preview only. Confirm actual successful consumption, then persist. Inspection does not increase use counts.
- Self messages are ignored; ambient social scoring is off by default. Explicit scoreAmbient changes eligibility, not truth.
- Daily quotas default to UTC; configure timeZone for the intended calendar. Independent decay anchors do not reconstruct interaction history already lost by older implementations.
- Updates use replaceId and optional expectedRevision. Latest head and currently effective value can differ for future plans.
- Lock/content revision conflicts need inspection and explicit reload/retry. No automatic merge or lock stealing occurs.
- Asynchronous stores use open/persist/reload; flush on async-only storage fails. Memory mutation and durable commit are distinct stages.
- Complete labels/advice count toward context budgets, so English presentation or longer guidance may fit fewer items. Inspect omissions rather than assuming fixed output counts.
- Default independent policy removes built-in emotion/health word lists and relationship wording. Host judgments/custom rules and original stored text remain available. Support state is host-authored.
- Stale tags cannot be repeatedly promoted by old use counts. setTag advice is a string, at most 2000 UTF-16 units. Repair invalid data explicitly on an isolated copy.
- Import/reload validate all encoded bytes, depth 32 and 2,000,000 nodes without executing getters/toJSON; individual values have smaller bounds.
- Disk/HTTP/MCP/CLI reject malformed UTF-8; snapshot paths must be regular files. Loopback Host/Origin and stdio backpressure checks remain enforced.
- Node permission modes denying fsync cause explicit JSON-save failure, not a skipped durability step.

## Rollback and transfer

Old writers reject newer schemas. Restore old code **and its pre-upgrade snapshot**; do not edit schemaVersion or let old code write a new file. Historical queries only inspect retained intervals and cannot recover physically removed data. Full recovery uses snapshot backups with the same identity; selective transfer carries current values through explicit mappings/previews and refuses unresolved conflicts or dependency loss.

See [API](API.md), [time/storage](time-storage.md), [learning](learning.md), [storage recovery](storage-backup.md) and [historical hardening](1.0-HARDENING.md). Recorded tests do not guarantee automatic repair of arbitrary corrupt history, network filesystems or power-loss scenarios.
