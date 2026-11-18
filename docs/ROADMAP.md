# Roadmap and release boundaries

Published stable release: 1.5.0; v1.0.0 remains a historical baseline. Current local development: 2.0 integration candidate on `work/1.6-development`. The library is the product; the web demo is auxiliary.

## 1.0 to 2.0

The owner selected local 1.1–1.4 development, an optional 1.5 midpoint release, local 1.6–1.9 development and a separately validated 2.0 release. Completing an internal milestone does not authorize a push, tag, GitHub Release or npm publication. 1.5.0 was explicitly approved and published. Final 2.0 publication still requires an owner decision.

| Milestone | Focus | State |
| --- | --- | --- |
| 1.1 | Host-oriented Agent entry, language support, extraction/review | Completed locally; exact host coverage is recorded separately |
| 1.2 | Write quality and dependent correction/invalidation | Completed locally |
| 1.3 | Optional semantic retrieval and bounded context | Completed locally |
| 1.4 | Optional storage, backup and migration | Completed locally |
| 1.5 | Inspection, explanation, owner management and independent policy | Published stable midpoint |
| 1.6 | Bounded task handoff | Completed locally |
| 1.7 | Owner-controlled local sharing and origins | Completed locally |
| 1.8 | Conditional experience feedback and retirement | Completed locally; Windows and Linux validation recorded |
| 1.9 | Measurements, paired comparisons, bounded maintenance | Completed locally; current Windows/Linux and offline package checks passed |
| 2.0 | Integrated validation, migration/recovery, packaging and documentation | Research evaluation and opt-in task context implemented locally. Consolidation and host/model validation follow. |

See the [nine-point design](1.0-2.0-ROADMAP.md), [host acceptance](AGENT-ACCEPTANCE.md), [1.8 validation](1.8-VALIDATION.md) and [1.9 specification](1.9-MEASUREMENT-SPEC.md).

The [research adoption plan](2.0-RESEARCH-ADOPTION.md) records evaluation and task context (R0–R1), followed by reviewed consolidation, native-memory coexistence and controlled model-quality trials (R2–R4).

## Quality and isolation

Review the current batch before starting the next. Report library tests, protocol/configuration checks and actual host/model tasks separately. Old cross-platform results do not certify later changes. Keep the core dependency-free and compose optional services explicitly.

All implementation and artifacts remain inside this project. Do not change QQA or everyday host settings to gather data. Public material excludes original chats, identities, credentials, private snapshots, backups and local diagnostics. Planning is not permission to change another application's configuration or publish a release.

Repository-facing documentation, comments, examples and default presentation use English. Preserve source-language memory, linguistic resources and multilingual fixtures. Authorship/notice changes still need evidence and explicit approval; English translation does not remove or expand copyright claims.
