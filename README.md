# persona-memory

**Host-independent memory for users, projects and tasks.** Typed records, scoped retrieval, corrections, temporal versions, reviewed learning and optional relationship state. JavaScript / TypeScript; zero runtime dependencies in the core.

Applications own model calls, identity, authorization and task execution. The library stores, selects, updates, expires and confirms the use of memory. Core operations require no model key; optional extractors and embedding services run only when explicitly invoked by the host.

## Where it fits

| Application | Memory | Host responsibilities |
| --- | --- | --- |
| Personal and office assistants | Preferences, lasting requirements, temporary state | User consent and model calls |
| Coding and project assistants | Constraints, decisions, task checkpoints, conditional experience | Verify task results and select the correct project |
| Support and business assistants | Confirmed customer facts, ticket status and next actions | Identity, access and authoritative business systems |
| NPCs and community bots | Character state, events, relationship dimensions and style | Game events and platform connectivity |
| Multiple agents or tools | Explicitly shared project/task records and bounded handoffs | Owner-controlled sharing, execution and conflict handling |

See [use cases](docs/use-cases.md) and the [API](docs/API.md).

## Stable release and local development

**1.5.0 is the published stable release.** It adds scoped Agent capture and separate owner review, provenance invalidation, optional semantic retrieval, optional native SQLite, full backup/restore and owner diagnostics/previews.

The current checkout contains **unpublished 1.9 development**: validated task handoffs, owner-controlled local sharing, reviewed experience feedback/reuse, and validated local measurement and bounded owner maintenance. Local snapshots use **schema 8** and read schemas 1–7. Published 1.5 uses schema 6. Back up before upgrading; old clients cannot read new schemas. Internal 1.6–1.9 milestones are not separate public releases; 2.0 requires its own validation and owner release decision.

**1.5 changes default behavior:** built-in emotion/health word lists and relationship wording were replaced with host-provided judgments and neutral numeric bands. Custom rules and existing data remain supported. Read the [policy migration guide](docs/1.5-POLICY-MIGRATION.md). Implementation is maintainer-directed and AI-assisted; the [origin review](docs/1.5-ORIGIN-REVIEW.md) has explicit limits and makes no worldwide originality guarantee.

## Capabilities

- **Typed subjects and records:** user / project / task; preference, fact, constraint, decision, episode and state. JSON values, source labels, evidence IDs and optional dependencies. Project facts do not affect relationship scores.
- **Scoped retrieval:** filter by subject, type, source, key and time; bounded local lexical ranking with selection/omission reasons. Optional semantic retrieval remains a separate explicit service.
- **Correction and time:** explicit replacement, revision preconditions, bounded history, future activation, expiry and valid-time/known-time queries.
- **Reviewed learning:** expiring proposals with accept/reject/revise operations; optional bounded acceptance of new fields. Experience retains conditions, outcomes and caller evidence assertions.
- **Storage and recovery:** JSON files, memory snapshots, custom asynchronous stores and optional SQLite. File locking, content revisions, selective transfer previews and full snapshot recovery.
- **Optional relationship state:** real interactions, configurable dimensions, correctable tags, expiry/decay and local style statistics; community, companion, support and NPC presets.
- **Use confirmation:** previewing does not increase use counts. Confirm successful consumption with a turn ID; retries are bounded and overlapping contexts can be confirmed atomically.
- **Local 1.6–1.8 additions:** [handoff](docs/handoff.md), [sharing](docs/sharing.md) and [experience reuse](docs/experience-reuse.md). Local 1.9 adds [scalar measurement and owner maintenance](docs/measurement-maintenance.md). These are local development features, not capabilities promised by npm 1.5.0.

## Installation

Pin the stable release and review migration before changing an existing installation:

```sh
npm install persona-memory@1.5.0
```

Or install the fixed GitHub tag:

```sh
npm install "github:suking459/persona-memory#v1.5.0"
```

The [GitHub Release](https://github.com/suking459/persona-memory/releases/tag/v1.5.0) also provides a tarball:

```sh
npm install ./persona-memory-1.5.0.tgz
```

Version 1.0.0 remains available for its historical default behavior and license terms. Use a maintained Node runtime for deployments; compatibility-test results and their limits are recorded in [integrations](docs/integrations.md). No intermediate development milestone is automatically published.

## Minimal project-memory example

Save as `example.mjs`, then run `node example.mjs`:

```js
import { PersonaMemory } from 'persona-memory';

const pm = new PersonaMemory({ storage: './data', scope: 'my-assistant' });
const project = { type: 'project', id: 'my-project' };
pm.putMemory({
  id: 'response-format-v1', // A stable ID permits retries with identical content.
  subject: project,
  kind: 'constraint',
  key: 'response-format',
  value: 'Lead with the outcome, then give the necessary details.',
  source: 'user',
  evidenceId: 'settings-1',
});
const context = pm.buildMemoryContext({
  subject: project, query: 'response-format', locale: 'en', budget: 1600,
});
console.log(context.text);
pm.flush();
```

Provide `context.text` to the model as reference data. After actual successful consumption, call `pm.confirmContext(context, {turnId:'unique-turn-id'})` and persist. Printing, previewing and failed requests do not count as use. Retrieved text never grants execution authority.

Without storage the instance runs in memory. JSON `flush` is synchronous; the application handles explicit conflict errors and bounded retries. Custom asynchronous stores use `PersonaMemory.open`, `persist` and `reload`. See [typed memory](docs/typed-memory.md), [retrieval](docs/retrieval.md), [time/storage](docs/time-storage.md) and [reviewed learning](docs/learning.md).

## Agent integration

Prepare an isolated connection bundle using the [connection and operations guide](docs/agent-operations.md). Generation does not apply host settings. Specific Windows Codex CLI and DSH headless versions have real-model lifecycle evidence; nine other generated host profiles and desktop interfaces retain explicit experimental boundaries in the [acceptance matrix](docs/AGENT-ACCEPTANCE.md). Users need not install or subscribe to every vendor's product.

Repository documentation, comments, examples and default presentation use English. Stored content retains its original language; explicit localized output and [multilingual regression fixtures](docs/multilingual.md) remain supported. See the [language policy](docs/REPOSITORY-LANGUAGE.md).

## Examples and validation

```sh
npm test
npm run typecheck
npm run example:memory
npm run example:retrieval
npm run example:learning
npm run demo
```

The local demo is a rule-based illustration, not a model-quality benchmark. Examples use synthetic data. See [cookbook](docs/cookbook.md), [tuning](docs/tuning.md), [evaluation](docs/evaluation.md), [storage/recovery](docs/storage-backup.md) and [owner management](docs/owner-management.md). Exact test environments and version boundaries are recorded in the milestone validation reports; passing tests is not a guarantee against unknown defects.

## License and origin

[MIT](LICENSE). Read [NOTICE](NOTICE.md) for historical references, current distribution boundaries and third-party obligations. Published history and previously granted license rights are preserved. See [source status](docs/1.5-SOURCE-STATUS.md) and the [file-level origin matrix](docs/1.5-ORIGIN-MATRIX.md).
