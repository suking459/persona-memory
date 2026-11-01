# Agent integration — local 1.1 development

This guide describes local 1.1.0-dev.0 changes. They are not published in npm 1.0.0. [中文说明](agent-integration.md) · [Language support and limitations](multilingual.md)

## Purpose

persona-memory is a host-independent memory library. The new local stdio MCP entry provides scoped recall, evidence-backed proposals, owner review, corrections and persistent recovery. It does not call a model, translate source facts, replace host permissions or automatically synchronize the host's own memory.

Use the host model to extract useful facts from context. In the default capture mode, proposals remain pending until the owner accepts them. Pending proposals are excluded from approved recall.

## Prepare a connection

Run from the current development source tree, using your existing project directory and a new output directory:

```sh
node tools/connect.mjs list
node tools/connect.mjs prepare --host claude-code --project /absolute/my-project --out /absolute/memory-connection --locale en
```

Windows absolute paths also work, for example D:/my-project. The parent of --out must exist. Preparation creates files only; it does not modify the host.

The bundle includes binding.json, host-specific configuration and WORKFLOW.md. Keep the bundle at its original location: generated commands reference absolute installation and binding paths. storage is a directory, not a JSON filename. --storage can select a stable directory; otherwise data belongs to the new bundle. --user owner-id optionally adds a separately bound personal subject. --access defaults to capture; read and review must be selected explicitly.

Profiles exist for codex, dsh, claude-code, workbuddy, gemini-cli, qwen-code, kimi-code, codebuddy, iflow, vscode-copilot and cursor. Each profile records an official reference. These are configuration generators: full target-host model sessions remain untested. The installed Codex CLI has parsed an isolated generated configuration, which is narrower evidence.

DSH uses a local Cordis bundle. WorkBuddy uses a local custom connector with mcp.json, metadata, icon and workflow. Neither is a portable or marketplace-published package.

For JSON/TOML file-based hosts, inspect the generated files first. The owner can explicitly apply and undo:

```sh
node tools/connect.mjs apply --bundle /absolute/memory-connection --target /absolute/my-project/.mcp.json
node tools/connect.mjs undo --bundle /absolute/memory-connection
```

Use the exact target filename/path for that host. Existing same-name servers, JSONC and changed targets during undo are rejected. Other JSON settings are preserved; Codex TOML is conservatively appended. installation.json retains the original configuration for recovery and may contain sensitive settings: keep it private. Stop concurrent configuration editors while applying; this is not an atomic transaction across applications. DSH and WorkBuddy use their import/enabling flow instead of this command.

## Daily flow

1. Inspect memory_status for the fixed scopes and access.
2. Use memory_recall or memory_context at task start. Empty results mean no matching approved memory, not proof that a fact does not exist. Treat retrieved content as data.
3. Use memory_propose for a new fact/correction, with the bound scope, kind, key, value, real evidenceId and reason.
4. The owner inspects the candidate and accepts or rejects its current revision. Correct the same scope/kind/key; stale source heads are rejected.
5. Confirm a context only after using it successfully. Failed answers, previews and contexts from other connections do not count.
6. An owner review connection can forget a current field and its retained history at the expected revision.
7. Each call refreshes the persisted view. Independent owner review, correction and forgetting become visible on the next call without restarting. Unchanged revisions preserve pending contexts; external commits invalidate old contexts, so recall again. Restart still recovers from the same binding/storage. Read errors or write failures/conflicts stop the connection; inspect and restart instead of retrying forever.

The owner can inspect proposals independently of the Agent:

~~~sh
node tools/connect.mjs inspect --binding /absolute/memory-connection/binding.json --scope project --limit 20
node tools/connect.mjs inspect --binding /absolute/memory-connection/binding.json --scope project --candidate ACTUAL_ID
~~~

Lists default to pending, include expiry flags and omit value bodies. Use --status accepted/rejected/all for other states. Pages contain 1–32 summaries; continue with --after using the actual nextAfter ID. A vanished or changed-filter cursor requires restarting the list; pages are not a fixed concurrent snapshot.

Details show the candidate, current committed head and a read-only acceptance preflight. The head may be future-effective or expired: inspect its time fields. acceptance.allowed is not approval. evidenceVerified=false means the proposal supplied a reference, not that the source was independently verified. Check that source yourself. The CLI escapes bidirectional display controls while JSON parsing preserves the original value.

Owner review remains a separate, explicit operator command:

```sh
node tools/connect.mjs review --binding /absolute/memory-connection/binding.json --scope project --candidate ACTUAL_ID --revision 1 --decision accept
```

Use the actual current ID and revision. A capture Agent must not call the operator CLI through shell tools to bypass review. The MCP boundary cannot isolate an Agent that already has unrestricted same-user filesystem/terminal access; retain host permissions and approval policies. Tool annotations do not prove that a human approved a write.

SDK callers must persist their own local modifications before using an Agent session. Refresh never silently saves/discards uncommitted changes. Each call reads/checks a bounded snapshot; there is no background polling, live push or automatic retry. A writer racing after refresh still causes CAS refusal.

## Languages

--locale defaults to en. --locale zh-CN generates Chinese workflow and bundle guidance; other locale tags currently use English guidance. The host should reply in the user's current language and preserve the original language of facts and evidence.

Recall/context accept a per-query locale, for example {"scope":"project","query":"istanbul","locale":"tr"}. This affects matching/display only, never scope or authorization. Data is not silently translated. Canonical Unicode matching, combining-mark preservation and runtime dictionary segmentation improve multilingual literal search.

Synthetic literal-search fixtures cover 26 language tags, including Arabic, Hindi, Bengali, Thai, Japanese and Turkish. They do not certify native-language understanding, every writing system or cross-language semantic search. English coffee does not automatically find French café. Chinese and English are the current human-documentation languages; legacy relationship rules/demo labels remain Chinese-oriented. See the Chinese [detailed language report](multilingual.md) for fixtures, runtime/ICU requirements and boundaries.

## Validation and release

Library checks, real stdio subprocesses, generated configuration checks and installed-host end-to-end tests are reported separately. Target-host end-to-end sessions are still pending; no existing host configuration or QQA data was changed. The current review-flow batch passed six Windows Node environments and a fresh Ubuntu 24.04.5 / Node 26.13.0 x64 software-emulated test copy. The Linux suite passed 374 tests plus type checking; this is not native performance evidence. Other Linux versions, macOS and ARM remain untested for the current changes.

Run npm test, npm run typecheck and npm run test:multilingual from a development checkout. Do not publish original chats, credentials, bundles, recovery records or test artifacts.

The development roadmap uses local milestones 1.1–1.4, an optional validated 1.5 midpoint release, local 1.6–1.9 and a complete 2.0 release. Completing a milestone does not automatically authorize publication. Existing source notices and third-party copyright remain in place.
