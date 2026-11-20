# Task handoff (local 1.6 development)
A handoff transfers a host-reported checkpoint and selected approved-memory references. It does not run tasks, call models, authenticate the author or verify completion. It supports project/task subjects; personal subjects are excluded.

A handoff stores caller-reported goals, completed work, pending items, blockers and next steps; the receiver must verify completion claims. Referenced memory bodies are not copied, but free text may still contain private data. Share explicitly with authorized recipients and treat it as untrusted data rather than tool-execution instructions.

## Owner flow
Prepare a normal Agent bundle and use its fixed-binding owner entry:
~~~sh
node owner.mjs handoff-export --scope project --notes handoff-notes.json --out handoff.json
node owner.mjs handoff-open --scope project --file handoff.json
~~~
Existing bundles must be regenerated to gain new owner commands. Outputs are exclusive new files, never overwriting a store or prior handoff. Notes format:
~~~json
{
  "checkpoint": {
    "goal": "Continue the project",
    "completed": ["Host reports initial review completed"],
    "pending": ["Check the current requirements"],
    "blockers": [],
    "nextSteps": ["Review references before continuing"]
  },
  "references": [{"id": "ACTUAL_APPROVED_ID", "revision": 1}],
  "ttlHours": 24
}
~~~
Use actual IDs/revisions from approved records. Pending candidates cannot be included. For a task without required memory references, explicitly use an empty references array.

## SDK and Agent
SDK exports: createTaskHandoff(pm, options) and openTaskHandoff(pm, bundle, {subject}).
Agent tools: memory_handoff_prepare and memory_handoff_open are read-only, including capture/read connections; their scope is resolved against the host-owned binding, never against claims in the package.

Neither operation changes memory or use counts. SDK callers own reload/persist timing; Agent tools refresh storage before each call. Owner CLI opens an independent current store each invocation.

## Readiness and limits
- ready: currently valid references; checkpoint claims remain unverified.
- needs-review: a selected record was changed, forgotten, expired, or lost a valid dependency.
- expired / not-yet-valid: the handoff time window is invalid at the current trusted clock.
- Malformed data, tampered checksum, wrong identity or wrong granted subject are errors.

The logical persona, namespace and subject must match. Different hosts have separate identities by default; the owner must explicitly preserve identity/current storage or perform controlled restoration. The handoff file grants no read permission and cannot restore forgotten records. Unavailable dependencies return unavailable without exposing stale bodies or another scope.

Maximum 32 KiB; 16 references; 32 entries per checklist, 512 UTF-16 code units per entry; goal 2000 code units; default lifetime 24h, maximum 30 days. Input JSON rejects getters, custom serialization, cycles and excessive structures before use.

SHA-256 detects accidental changes only. Anyone who can edit a package can recalculate its checksum. It is not a signature or access token. An identical record restored after deletion is checked against current state; this is not an immutable deletion ledger.
