# Agent host acceptance

Historical test date: 2026-11-01, local 1.5 candidate. Exact entry/version/layer matters; generated configuration and protocol success are not real-model sessions. Later 1.6–2.0 features have no new host/model certification from these results.

| Host | Tested entry | Native client | Real model | Unverified |
| --- | --- | --- | --- | --- |
| Codex | Windows x64 CLI 0.166.0-alpha.5.1 | Actual app-server tool pipeline passed | Five cases, owner login and CLI default model | Desktop UI, other systems/versions |
| DSH | Windows x64 headless 0.2.1-rc.5 | Configuration composition/registration/execution passed | Five cases, official DeepSeek API | Desktop UI, other systems/versions |
| WorkBuddy, Claude Code, Gemini CLI, Qwen Code, Kimi Code, CodeBuddy, iFlow, VS Code Copilot, Cursor | Generated configurations | Not accepted in actual clients | Not accepted | Experimental until environment-specific validation |

Users need not install/login/subscribe to every vendor. Validate available tools first; unlisted products acquire no automatic support promise.

## Codex real-model lifecycle

1. Model actually calls memory_status and memory_propose; pending content is absent from approved recall.
2. Separate owner command accepts; another model process recalls the original Japanese value.
3. Model proposes a Spanish correction, still pending; owner separately accepts.
4. Fresh process/session recalls the corrected formal value.
5. Owner previews/forgets; another model session makes an actual recall and returns EMPTY.

Tool calls, persisted snapshots and owner results were cross-checked from private wire logs, not merely the model's claim of saving. All values/evidence IDs were synthetic; real user preferences were not changed to test languages.

## DSH

The native headless runtime actually loaded generated Cordis configuration and registered the then-current eight capture tools. Its internal execution pipeline verified pending invisibility, independent review, immediate correction, restart recovery, previewed forgetting and scope denial. Official-API-driven real models also completed the five cases above; new-process recall and post-forget empty results have actual MCP records.

After fixtures wrote results, the controller ended their isolated process trees; this is not normal desktop exit/hot-unload acceptance. Daily profiles remained separate. Public docs and the installed version's internal APIs differed, so private fixtures matched the tested runtime; the public library still uses standard MCP rather than depending on internal host APIs.

## Privacy and credential handling

Test configuration, temporary host directories, sessions and synthetic stores stayed in private project diagnostics. The service was not installed into daily Codex/DSH settings and other projects/QQ chats were not imported. Codex login occurred in its own owner-authenticated directory without copying an existing login cache. The DSH key entered through local hidden input, not chat.

Credentials/raw calls/account artifacts/bindings do not enter Git/npm. The isolated Codex directory was logged out with native tooling and dedicated login/key windows closed. No project host-test process remained; daily DSH continued. Ten DSH child-environment probes found no model key passed to memory MCP and output checks found no raw key residue. Public docs retain only versions/scenarios/findings.

Generated bundles still mark each newly created connection unaccepted in its own environment, including desktop paths. These exact CLI results cannot certify all installations. They do not prove malicious prompts impossible, universal correct tool selection, semantic accuracy or no unknown defects. Library/install/platform tests are a separate layer; host acceptance does not resolve origin/copyright questions.

References used for this historical validation: [OpenAI MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [app-server](https://learn.chatgpt.com/docs/app-server), [DSH MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md), [DSH tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md).

Private evidence names: `.artifacts/1.5-host-acceptance/{codex-native-report.json,codex-model-report.json,dsh-native-report.json,dsh-model-report.json}`. These are not distributed.
