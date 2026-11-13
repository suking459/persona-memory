# Independent long-term memory evaluation

Run `npm run evaluate:long-term` or `node tools/evaluate-long-term.mjs --out NEW_REPORT.json`. Output files are exclusive; existing files are refused. The tool requires no model key, provider, runtime dependency or native host installation. Development consumers need the source checkout to run the regression tests.

The dataset in tools/fixtures/long-term-cases.json is independently authored. Capability categories are informed by the [research review](2.0-MEMORY-RESEARCH.md), especially the distinction between retrieval and complete evidence for a question. No external benchmark questions, conversations, answers, prompts or implementation are copied.

## What runs

Seven deterministic synthetic scenarios produce 22 API-level questions. Steps include formal writes, candidate proposal/review, correction, explicit dependencies, scheduled activation, expiry, forgetting and fresh memory-store/snapshot round-trips. Original-language Japanese and accented values are retained.

The default reader uses the real lexical search and context renderer. Gold IDs and forbidden IDs reach only the scorer, never the reader's query options. Each rendered JSON record is parsed back out of the actual payload and checked against context references. The evaluator also checks character budgets and that reads leave serialized state unchanged. It does not run natural-language extraction, model answering, real semantic retrieval, disk-crash recovery or a vendor Agent.

## Metrics

- Retrieval precision/recall and forbidden IDs expose missing, extra, stale or private evidence.
- Complete-evidence rate requires every gold source for a positive question; retrieving one of two sources is not success.
- Rendered-context metrics separately expose evidence lost to final packing/budgets.
- Empty-gold questions have separate abstention counts and null positive recall/completeness; they do not inflate evidence-set coverage.
- All questions contribute to the reported overall counts. Required lifecycle questions and diagnostic challenges are separately listed. CLI exits unsuccessfully for required-case failures; challenge failures remain visible in JSON even when the command exits successfully.

The harness rejects duplicate IDs, conflicting expected/forbidden sets, duplicate questions, unknown tiers/actions and bounded-work violations. Regression negative controls deliberately return all records, mutate the store while reading and exceed a budget, so a harness that blindly accepts those results fails its own tests.

## Baseline observed 2026-11-13

| Group | Exact evidence-set checks |
| --- | ---: |
| Required lifecycle/scope/literal cases | 17 / 17 |
| Diagnostic challenges | 0 / 5 |
| All questions | 17 / 22 |

Search evidence recall: 16/20 = 0.80; complete positive sets: 13/17. Rendered-context evidence recall: 14/20 = 0.70; complete positive sets: 12/17. Five empty-gold questions abstained correctly; no explicitly forbidden IDs appeared in this small fixture. These figures diagnose this authored dataset and lexical policy, not production accuracy or safety.

Two challenges intentionally prevent complete evidence: `limit: 1` for a two-source question, and a 100-character budget too small to fit the records. They are capacity controls, not software defects. The other three show areas needing separate work: semantic paraphrases, cross-language meaning and standing constraints without query-word overlap. See [R1–R4 adoption](2.0-RESEARCH-ADOPTION.md). Passing Unicode preservation is not passing cross-language semantic retrieval.

No oracle vectors, external model judge or answer generation is used. The result is not a LongMemEval/LoCoMo score, real-host acceptance, model-quality comparison, prompt-injection robustness result or proof that memory saves tokens/money.

Raw reports and runtime verification for this batch stay in `.artifacts/2.0-research-20261113/`, excluded from distribution. The 2026-11-09 [candidate matrix](2.0-VALIDATION.md) remains historical evidence for its frozen source; follow-up evaluation/tool changes have their own verification record.

## Source verification for this follow-up

The 2026-11-13 frozen runtime/test/package manifest has digest `c79103a9dfb51f6c0c05774fac119521eb6010f4c8b8d6bfbae1c550b06bbf5c`. Windows x64 passed Node 18.20.8 core 618, Node 20.20.2 supported full 628, and Node 22.23.4 / 24.16.0 / 24.22.2 / 26.13.0 full 643 each, with zero failures/skips/cancellations. Types and all four synthetic evaluations passed their stated gates.

Project-only Linux x64 / Node 26.13.0 / kernel 6.8.0-147 under emulation passed the six new evaluator regression tests and ran all 22 questions, with the same 17 required passes and five diagnostic failures. Source hashes matched before/after. This is focused Linux verification of an evaluation/documentation change, not a rerun or re-certification of the earlier full Linux suite. Runtime memory behavior, schemas, providers and host configuration are unchanged by this follow-up.

Concrete package evidence is recorded separately against its tarball hash and installed entry points, including the packaged fixture. Host/model acceptance and controlled on/off trials remain open adoption gates.
