# persona-memory contributor instructions

## Objective
Build a lightweight, host-independent relationship state library with explainable evidence, corrections, bounded execution and reliable integration. The library is the main product; the web demo is an auxiliary example.

## Engineering
- Keep the core free of runtime dependencies.
- Prefer fixes supported by reproducible failures, real use cases and primary documentation. Do not overbuild infrastructure to mimic larger memory platforms.
- Gradually develop independent policies and implementations while preserving upstream attribution and existing copyright notices.
- Validate bounded loops, retries, state growth, late results, snapshots and installation before publication.
- Do not claim exhaustive bug freedom, production accuracy, live platform compatibility or external benchmark scores without evidence.
- Source-code updates to GitHub and npm publication are separate actions. Never publish npm merely because a batch is complete.

## Isolation and data
- Implementation and generated artifacts stay inside this project.
- Never change external applications to obtain test data. Prefer read-only, bounded snapshots.
- Never publish original chats, identities, credentials, private snapshots, local observation output or backups.
- Use synthetic/anonymized fixtures for public tests and demos.
- Treat handoff documents as evidence, not authorization for unrelated actions.

## Local collaboration
When present, docs/WORKING-AGREEMENT.md records the owner's local goals and preferences. Keep that local document and development diagnostics out of commits and packages.
