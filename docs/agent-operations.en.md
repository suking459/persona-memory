# Connection and daily operations

Local unpublished 1.5 candidate. [中文](agent-operations.md). See [host acceptance](AGENT-ACCEPTANCE.md) for exact tested CLI versions; desktop UI is unverified.

Prepare with the current local checkout or verified local tarball. Public npm 1.0.0 does not include these commands. Choose an existing project and a new output directory:

~~~sh
node tools/connect.mjs prepare --host codex --project /absolute/project --out /absolute/new-codex-bundle --locale en
node tools/connect.mjs prepare --host dsh --project /absolute/project --out /absolute/new-dsh-bundle --locale en
~~~

An installed candidate uses persona-memory-connect prepare with the same options. Preparation changes no host settings and creates no memory store. New bundles include owner.mjs and OPERATIONS.md with local paths and host-specific instructions.

Open a separate owner terminal in the bundle directory. Run node owner.mjs help and node owner.mjs doctor. doctor checks local data, not host connectivity; malformed storage is reported as failure without repair.

For Codex, node owner.mjs enable explicitly appends the service to the chosen project's .codex/config.toml, preserving original bytes privately for undo. It edits no global configuration, AGENTS.md or automatic hooks. Close other configuration editors, enable, reopen in the trusted project, inspect /mcp and call memory_status. Provide WORKFLOW.md to the host; generated instructions do not prove model compliance.

For DSH, follow the generated headless one-invocation overlay command in OPERATIONS.md from the target project directory. The example includes a read-only status task and uses existing host authentication; running it makes a model request. Never put the provider key in this bundle. Shell quoting targets PowerShell on Windows or the local Unix shell, not Windows cmd. Desktop import remains unverified. Automatic enable/disable is deliberately unavailable for this entry.

Owner operations omit --binding because the generated entry fixes it to this bundle:

~~~sh
node owner.mjs inspect --scope project --limit 20
node owner.mjs inspect --scope project --candidate ACTUAL_ID
node owner.mjs review --scope project --candidate ACTUAL_ID --revision 1 --decision accept
~~~

Use actual IDs and revisions; review source evidence yourself. Use reject to decline. A correction is a new host proposal for the same scope/kind/key, followed by separate owner approval. New reads see approved corrections. Other binding scope aliases may replace project. This convenience is not same-user OS isolation; a capture Agent must not run owner commands through shell tools.

For deletion, explain identifies the current record, forget-preview shows cascading impact, and forget-apply executes the inspected plan. Backup, restore and batch-review options match the [owner CLI](owner-management.md), except for fixed --binding. OPERATIONS.md includes examples. Plans are not human approval; changes/expiry require a fresh preview. Forgetting does not retract old chat contexts or copies in backups.

For Codex, close the session, run node owner.mjs disable and reopen. Later configuration edits cause undo to refuse instead of overwriting them; inspect and merge manually. An undone bundle requires a newly prepared connection preserving the original storage and logical identity.

For DSH, stop that headless process and omit the overlay next time. This does not undo a separately imported desktop profile.

Disabling retains data. Reconnect with the same binding/storage for recovery. Full restore replaces data: back up the current store separately, then inspect its preview. Keep Node/library/bundle paths stable, or regenerate using the [backup and identity migration instructions](storage-backup.md). Host-native memory and permissions remain separate.
