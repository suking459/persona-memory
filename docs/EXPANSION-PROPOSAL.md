# Historical 0.6–0.9 general-memory proposal

Date: 2026-10-29. The owner authorized implementation and the four batches later completed locally before unified 1.0 publication. These were internal work nodes, not separate release permissions. The original public/package baseline was preserved during development.

The goal was an embeddable long-term memory/context component with user/project/task records. Social relationships remain optional; project facts must not be disguised as people or influence affinity. Existing provenance/correction/scope/lifecycle/history/budget/diagnostic capabilities were reused, not counted again as new features.

| Batch | Minimal delivery | Optional extension |
| --- | --- | --- |
| 0.6 | Explicit subjects/kinds, key/JSON value, provenance, independent lifetimes and replacement | Business-specific fields |
| 0.7 | Scoped metadata/query filtering, bounded lexical ranking and selection/omission explanations | Host-supplied embeddings/reranking |
| 0.8 | Bounded temporal versions, CAS, store interface, selective transfer/mapping/previews | SQLite after concurrency/recovery evidence |
| 0.9 | Expiring reviewed candidates, pluggable extraction, conditional host experience | Language extractors/feedback/inspection |

## Intended contracts

0.6: stable IDs, explicit subjects and restricted JSON support preferences, project requirements, temporary state, task decisions and experiences. Different lifetimes prevent temporary mood, lasting preference and project facts from sharing one TTL. At least personal/project/learning-or-creation use cases should work without scenario-specific core branches; legacy social data migrates.

0.7: scope before ranking; objective relevance is not social score. Query release plans for constraints/decisions and response format for preferences. Empty means empty, not recent unrelated filler. Optional relevance remains outside the default core; data-model semantics do not require vectors. Bound candidates/text/characters/tokens and produce reproducible rankings/reasons. Expired/replaced/foreign records cannot be promoted by score.

0.8: distinguish learned and effective time; a next-week setting is not current immediately. Explicit host dates/replacements, not arbitrary natural-language time inference. Later arrival does not automatically mean greater truth; preserve unresolved conflicts. Bounded history rather than an entire event platform. Explicit async open/persist without silently changing all sync APIs. Backend CAS must reject stale writes. Selective export/mapping/preview transfers project-format data rather than an industry-standard permission package. Test future/late updates, stale versions, conflicts, isolated subjects and deletion boundaries.

0.9: rule/model/offline extractors supply bounded candidates. Validate scope/type/source/count/conflict before review; default accept/reject/revise, optional tightly bounded host acceptance, never text-granted authority. Experience stores context/attempt/result/conditions; host verification does not generalize one outcome. Inspection shows what was learned, why and when. Plugins are optional, bounded and cancellable; no default resident learner, paid call, repeated self-summary or task scheduler. Test rejection invisibility, retry growth, stale-base protection, explicit uncertainty, atomic failures and cross-session/time/update/abstention scenarios; test counts are not real benefit scores.

## Priorities, deferrals and evidence

Start with format/identity/migration (0.6), relevance (0.7), durable correction/transfer (0.8), then reviewed learning (0.9). Keep core runtime dependencies zero and compose optional services. Evaluate correct current selection, correction propagation, irrelevant recall, abstention, context/time and state growth on fixed inputs. Generality means multiple explicit uses, not automatic expertise in every industry.

Defer full knowledge graphs/document RAG/identity inference/workflow engines/resident agents/cloud control panels and full event sourcing unless concrete needs justify them. Platform adapters follow actual host demand.

References checked 2026-10-29, not current market statistics or project-effect evidence: [LangGraph memory](https://docs.langchain.com/oss/javascript/concepts/memory); [Mem0 search](https://docs.mem0.ai/core-concepts/memory-operations/search), [add](https://docs.mem0.ai/core-concepts/memory-operations/add), [update](https://docs.mem0.ai/core-concepts/memory-operations/update); [Zep facts](https://help.getzep.com/facts); [Letta memory](https://docs.letta.com/agent-sdk/memory) and [repositories](https://docs.letta.com/agent-sdk/repositories); [LongMemEval](https://arxiv.org/abs/2410.10813). At review time the Mem0 add page described incremental append, not an assumption that all historical automatic update descriptions remained current. Letta's MemFS/content-version ideas informed inspectability/CAS, not service copying. The full LongMemEval benchmark was not run.

Actual batch contracts are in typed-memory.md, retrieval.md, time-storage.md and learning.md. Each addition required new API/migration/install/environment evidence; older 86-test results could not certify it. Work/synthetic artifacts stayed project-local, QQA/other apps stayed independent, and intermediate batches were not pushed/released before unified 1.0.
