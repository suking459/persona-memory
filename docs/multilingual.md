# Language support and boundaries

Introduced in local 1.1; later milestones retain the same original-language constraints. Repository-facing prose/comments/examples/default presentation now use English. This does not translate user memory or remove multilingual functionality. Published 1.5 contains the 1.1 foundation; local additions have their own version gates.

## Mechanisms

- Values, evidence and Unicode identities retain their source text through reads/export/persistence/restart.
- Explicit BCP 47 locale (for example en, zh-CN, ja, ar, hi, th, tr) changes matching/display, not authorization or geography.
- Matching applies NFC and locale-sensitive case handling without rewriting stored data. Marks and internal connectors are retained to avoid false Indic matches.
- Thai/Lao/Khmer/Myanmar use runtime Intl.Segmenter dictionary boundaries; Chinese/Japanese use bounded character/bigram matching; other text uses words/identifiers.
- Agent bindings default to en, including old bindings without locale. Explicit zh-CN can still select localized bundle guidance/labels. Other instruction locales fall back to English.
- memory_recall/context can override query locale per call without changing subjects, namespace, write access or review requirements.
- Host instructions preserve source assertions and respond in the user's current language. Model understanding/extraction quality is not supplied by a built-in translation model.

```sh
node tools/connect.mjs prepare --host workbuddy --project /absolute/project --out /absolute/new-bundle --locale en
```

Project must exist and output must be new. Preparation writes only the bundle; enable through the [connection guide](agent-integration.md). For a Turkish query, arguments can be `{"scope":"project","query":"istanbul","locale":"tr"}`.

```js
pm.searchMemories({subject:{type:'project',id:'work'},query:'กาแฟ',locale:'th'});
pm.buildMemoryContext({subject:{type:'project',id:'work'},query:'咖啡',locale:'zh-CN',budget:2000});
```

These non-English query literals deliberately demonstrate language support. Generic bridge, typed legacy MCP and HTTP share locale validation. Locale is not guessed from mixed-language chat. English is the default new presentation; explicitly selected Chinese resource strings and stored source content remain intact.

## Evidence and limits

Synthetic literals cover 26 tags: en, zh-CN, ja, ko, fr, es, de, pt, ru, ar, he, hi, bn, th, lo, km, my, tr, vi, id, ta, te, fa, sw, uk, pl. They test text fidelity, scoped literal retrieval and persistence/recovery, not native-speaker quality or universal language understanding.

Regressions cover no-space Thai, Indic marks, Turkish case/stop words, NFC/NFD, Arabic/emoji/bidi-safe rendering, locale changes without escalation, actual stdio proposal/owner review/restarted recall and full code-point budgets. See [initial language batch](1.1-MULTILINGUAL-BATCH.md), [subsequent Linux review-flow validation](1.1-REVIEW-FLOW-BATCH.md) and current milestone reports. Run test:multilingual.

Literal matching does not automatically equate English coffee and French café; optional semantic quality needs the actual chosen embedding provider. Marks are not globally ignored and morphology/stemming/spelling are not universally implemented. Segmenter depends on actual Node/ICU builds and fails explicitly when unavailable. Code points are not graphemes or tokens; tokenBudget needs the real tokenizer.

Historical Chinese lexical evidence rules and compatibility tag identifiers remain intentional language resources. They are not a global extraction model. Other UI translations, accessibility/RTL visual review and native-speaker assessment remain separately scoped. Library/configuration/protocol success is not vendor-host acceptance or certification of national law/data residency/service availability. Copyright obligations do not disappear with a language change.
