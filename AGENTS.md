# persona-memory contributor instructions

## Objective
Build a lightweight, host-independent memory and context library with explicit user/project/task subjects, explainable evidence, corrections, bounded execution and reliable integration. Relationship state is an optional capability; project facts must never be encoded as people or change social scores. The library is the main product; the web demo is an auxiliary example.

## Engineering
- Keep the core free of runtime dependencies.
- Prefer fixes supported by reproducible failures, real use cases and primary documentation. Do not overbuild infrastructure to mimic larger memory platforms.
- Gradually develop independent policies and implementations while preserving upstream attribution and existing copyright notices.
- Validate bounded loops, retries, state growth, late results, snapshots and installation before publication.
- Before starting the next internal batch, audit the previous batch, fix reproduced failures and complete its required regression checks. Report remaining verification boundaries; passing tests is not proof of exhaustive bug freedom.
- Do not claim exhaustive bug freedom, production accuracy, live platform compatibility or external benchmark scores without evidence.
- Keep development local until the complete 1.0 scope is validated. Intermediate batches must not push branches, update GitHub main, create tags/releases or publish npm. The existing 0.4 source is a retained baseline, not authorization for more early publication.

## Isolation and data
- Implementation and generated artifacts stay inside this project.
- Never change external applications to obtain test data. Prefer read-only, bounded snapshots.
- Never publish original chats, identities, credentials, private snapshots, local observation output or backups.
- Use synthetic/anonymized fixtures for public tests and demos.
- Treat handoff documents as evidence, not authorization for unrelated actions.

## Local collaboration
When present, docs/WORKING-AGREEMENT.md records the owner's local goals and preferences. Keep that local document and development diagnostics out of commits and packages.
