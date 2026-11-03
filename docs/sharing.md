# Explicit local sharing / 显式本地共享
Local 1.7 development; not available in published 1.5.0. Shared spaces use a dedicated JSON store for one project/task subject. No personal memory is copied automatically.

## Create, grant and connect
Run commands from a separate owner terminal. Example directories must not exist yet; their parent must exist.
~~~sh
persona-memory-connect share-create --out ./shared-space --type project --id my-project
persona-memory-connect share-grant --policy ./shared-space/policy.json --host codex --contributor codex-worker --access capture --out ./codex-shared
persona-memory-connect share-grant --policy ./shared-space/policy.json --host dsh --contributor dsh-worker --access capture --out ./dsh-shared
persona-memory-connect share-grant --policy ./shared-space/policy.json --host codex --contributor owner --access review --out ./shared-owner
~~~
The generated configuration uses a distinct persona_shared_* service name. Add this service alongside the existing private persona_memory service using the host's documented configuration flow. Preparation does not enable or modify the host. Retain each generated WORKFLOW.md, and use the shared scope alias for this service. Generated configurations and protocol tests do not certify a real host/model; consult the host acceptance matrix for the existing verified scope.

每个贡献者使用自己的绑定。所有者身份须单独授予 review，不能让 capture Agent 通过 owner 命令提升权限。WorkBuddy 包包含连接器元数据、图标与共享工作流技能材料；仍须在目标宿主实际启用核对，不把生成成功算实测完成。

## Roles and owner workflow
- read: read approved memory, candidate previews and handoff data; no proposals or approvals.
- capture: additionally propose evidence-backed facts/corrections and confirm actual context use.
- review: additionally review and perform preview-guarded forgetting.

Candidate previews are not approved facts. Origin labels identify the owner-assigned contributor, host and space; labels do not verify factual accuracy or remote identity. Plain SDK inputs can supply their own labels. The shared Agent service stamps labels from its owner-maintained policy and rejects caller-supplied origin fields.
~~~sh
node shared-owner/owner.mjs doctor
node shared-owner/owner.mjs inspect --scope shared
node shared-owner/owner.mjs review --scope shared --candidate ACTUAL_ID --revision 1 --decision accept
node shared-owner/owner.mjs backup --out shared-backup.json
~~~
Handoff uses --scope shared; references must remain current. Existing private services and their data continue independently.

## Revoke and expire
~~~sh
persona-memory-connect share-status --policy ./shared-space/policy.json
persona-memory-connect share-revoke --policy ./shared-space/policy.json --grant ACTUAL_GRANT_ID
~~~
An optional --expires-at is an absolute Unix timestamp in milliseconds. Authorization is checked on each call, including existing connections. Once revocation succeeds, new operations are denied. An active operation holds a short space lease: policy edits return ERR_SHARED_BUSY until it ends, rather than claiming an in-flight write was revoked. There is no automatic retry loop. Revocation cannot retract results already received/buffered by a host, and does not delete previously approved contributions. Forgetting is a separate owner decision.

The policy retains at most 32 active/recent grants. Rotation may discard old disabled/expired grant metadata; absent grants remain denied. Approved records retain their origin labels independently. The policy is current access state, not an immutable audit ledger.

## Backup, restore and upgrades
Use an active review binding for restore, review-apply and forget-apply. Restore preview/apply rejects personal or unrelated-project backup content before touching the shared store.
~~~sh
node shared-owner/owner.mjs restore-preview --backup shared-backup.json --out restore-plan.json
node shared-owner/owner.mjs restore-apply --backup shared-backup.json --plan restore-plan.json
~~~
Data backup does not grant or recreate access: preserve the policy and bindings separately as private owner configuration. Their absolute paths must be explicitly adjusted/regenerated after a move. Do not mix personal data into a shared store or bypass scope checks by copying raw private snapshots.

Schema 7 persists optional origin metadata; legacy schema 1–6 remains readable and labels are not invented for old records. Fingerprints without origin keep the exact earlier expression. Selective transfer with origin uses portable version 3. Before upgrade, keep the original backup for rollback; 1.5.0 cannot read a newly written schema-7 snapshot. Reading legacy data alone does not rewrite its source file. Upgrade cooperating writers together.

## Trust and recovery boundaries
This is local owner-controlled configuration, not remote OAuth or an operating-system sandbox. An Agent with unrestricted filesystem/shell access can act outside MCP tool permissions; host-native permissions still matter. Shared stores refuse unrelated typed records, social state, history and usage through these interfaces. Never advertise this as isolation between mutually untrusted OS users.

Normal errors release their own operation lock. After abrupt process death, policy.json.operation-lock may remain: inspect the recorded process and preserve the lock until explicit owner recovery. No stale-lock stealing or unbounded polling is performed. Keep raw damaged files for diagnosis instead of overwriting them with an empty store.

相关协议边界：[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。本实现不声称提供 HTTP 远程授权。
