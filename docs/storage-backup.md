# Storage, backups and migration

本地 1.4 功能，尚未公开发布。默认 JSON 与 Node 18 支持保留。SQLite 需 Node 22.13+；迁移先保留逻辑身份，再预览恢复，目标变化即拒绝执行。备份包含完整记忆数据，请自行保密；校验和不证明来源可信，也不验证事实。

## Choose a store

JSON remains the default. No database or native package is downloaded. SQLite is optional and uses the runtime's node:sqlite; importing persona-memory on Node 18/20 does not load SQLite. Explicit SQLite construction on an unsupported runtime fails before creating files. Node may label its own SQLite API experimental depending on runtime version.

```js
import {PersonaMemory,SQLiteSnapshotStore} from 'persona-memory';
const memory = new PersonaMemory({
  persona: 'assistant',
  scope: 'my-project',
  store: new SQLiteSnapshotStore({
    file: '/absolute/project-data/memory.sqlite',
    namespace: 'my-project',
  }),
});
```

Use either storage (JSON directory) or a synchronous store in the constructor. Async stores still use await PersonaMemory.open({store}). Persist with await memory.persist(), or flush() for synchronous stores. Neither store merges competing writes. A stale writer receives ERR_STORE_CONFLICT; an active SQLite writer receives ERR_STORE_LOCKED promptly. Reload and resolve intentionally. There is no retry loop, lock theft, background service or remote database.

SQLite uses a transaction, an application marker and a checked strict table. It refuses hard-linked database files (multiple names can split recovery journals), foreign databases, changed schemas, unsupported journal modes and pre-existing unclaimed empty files. Only a file created exclusively by the first write can be initialized. Snapshots and namespace count are bounded (64 MiB and 32 namespaces by default); keys are bound SQL parameters. Each operation closes its connection. Read-only inspection does not initialize a missing database. After an interrupted first initialization, an empty unclaimed file may need manual inspection; the library does not delete or adopt it automatically.

These checks prevent common selection and state mistakes; the application marker is not authentication against another program able to edit the file. File permissions belong to the owner. No protection against a malicious same-user filesystem race or a native SQLite engine vulnerability is claimed.

Do not copy a live database file as a backup. This adapter expects rollback journal DELETE, not WAL. Use the logical backup API below. secure_delete is requested for SQLite writes, but filesystem snapshots, other backups and previously copied data remain; deletion is not a forensic erasure guarantee.

## Full logical backup and guarded restore

```js
import {createMemoryBackup,inspectMemoryBackup,
  previewMemoryRestore,restoreMemoryBackup} from 'persona-memory';

const backup = await createMemoryBackup(memory);
const summary = inspectMemoryBackup(backup);
const preview = await previewMemoryRestore(targetMemory, backup);
console.log(preview.replacing, preview.restoring);
// After the owner has inspected the replacement:
const result = await restoreMemoryBackup(targetMemory, backup, preview);
```

A backup contains the full snapshot: records, source dependencies, pending/reviewed proposals, historical versions and optional relationship data. It excludes host configuration, storage locations, embedding service settings and credentials. Application-provided memory values themselves may contain private information; do not publish a backup. There is no encryption or cloud upload.

The versioned SHA-256 checksum covers the payload using sorted object keys. It detects accidental corruption; anyone able to edit a backup can recompute it. Importing data does not authenticate its author or verify its claims. Invalid UTF-8, non-JSON/accessor data, unsupported schemas, wrong persona/scope, dependency cycles and excessive data are rejected by the existing bounded snapshot validator. Schemas 1–5 are read and normalized to 6 without changing the source backup. Custom configuration such as relationship dimensions must be supplied consistently by the SDK owner; backups do not carry or install executable rules.

Restore replaces the whole target; it does not merge or selectively rename records. Preview shows counts, expires after ten minutes and binds the source checksum, current state digest, revision and configuration. Apply rechecks the target and uses compare-and-swap. SDK previews bind logical identity/state, not a physical filename; the Agent CLI additionally binds the normalized target configuration. Persistent targets must be clean. Back up valuable target data before replacement.

A failed write does not import the incoming state into the live core. An arbitrary external store can fail after its own commit; inspect that store before retrying an ambiguous failure. If a successful asynchronous write overlaps new local edits, the receipt reports committed:true and requiresReload:true; those edits remain in memory and must be resolved explicitly. It does not claim the committed write rolled back. Core operations during an awaited store operation receive existing busy/dirty safeguards.

## Agent operator workflow

Preparation only writes a new project-owned bundle. It does not enable a host or create a database.

```text
persona-memory-connect prepare --host codex --project ABSOLUTE_PROJECT --out NEW_BUNDLE --backend sqlite
persona-memory-connect backup --binding OLD_BINDING_JSON --out NEW_BACKUP_JSON
persona-memory-connect prepare --host claude-code --project NEW_ABSOLUTE_PROJECT --out NEW_BUNDLE --backend sqlite --identity-from BACKUP_JSON
persona-memory-connect restore-preview --binding NEW_BINDING_JSON --backup BACKUP_JSON --out NEW_PLAN_JSON
persona-memory-connect restore-apply --binding NEW_BINDING_JSON --backup BACKUP_JSON --plan NEW_PLAN_JSON
```

Replace all uppercase placeholders with real paths. Existing output files are never overwritten. The parent directory must exist. Paths are resolved by the CLI; binding paths become absolute. Preview does not create the missing target store.

Moving to another machine changes physical paths. --identity-from deliberately preserves persona, namespace and subject aliases/IDs, so derived source links remain meaningful. It copies no host permission grant or provider credential; new access defaults to capture, with separate owner review. Without the explicit identity option a new project obtains its ordinary new identity and a mismatched backup is refused. The option prepares identity only; restore remains a separate explicit action.

Backups/plans use exclusive creation and private file mode where the platform supports it. A restore plan is not a security approval token: an owner with write access can replace it. It is a change/expiry guard. Do not accept backups or plans from an untrusted source merely because a checksum matches. Existing host-native memory stays separate; no running external host or its settings is changed by these commands unless the owner separately invokes the documented apply action.

## Verification boundaries

Windows runtime matrix, Linux isolated guest, real SQLite transactions, mid-transaction subprocess exit, lock contention, stale writers, logical JSON–SQLite–JSON migration and real MCP subprocess restart are tested. Process interruption is not proof of power-loss durability. Actual vendor model sessions and model accuracy are separate checks and remain unverified.

Primary implementation references: [Node 22 SQLite API](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html), [Node 24.16 SQLite API](https://nodejs.org/download/release/v24.16.0/docs/api/sqlite.html), [SQLite application_id](https://sqlite.org/pragma.html#pragma_application_id), [SQLite trusted_schema](https://sqlite.org/pragma.html#pragma_trusted_schema).

SQLite path safety reference: [Multiple links and recovery journals](https://sqlite.org/howtocorrupt.html#_multiple_links_to_the_same_file). Do not rename/unlink a live database or place it on a filesystem without reliable locks. These safeguards cannot prevent another same-user process from changing paths during an operation.

SQLite payloads are read as bounded raw bytes and strictly decoded as UTF-8 before JSON parsing, so invalid stored bytes are refused rather than silently converted to replacement characters. The database remains unchanged on this read failure.
