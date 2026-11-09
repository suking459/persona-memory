# Repository language policy

Adopted 2026-11-09 at the owner's request. Use English for new and maintained public documentation, comments, examples, interface labels and default generated guidance. Conversation with the owner follows their requested language.

Memory values, evidence text and identities preserve their original language. Do not translate stored user content. Explicit locale resources, linguistic rules, compatibility identifiers and multilingual regression fixtures remain in the languages they test. In particular, OneBot mention placeholders participate in legacy Chinese subject-attribution checks; translating those placeholders changes behavior and can misattribute statements.

README, current guides, historical milestone summaries and origin reports are now English. Historical reports were edited for readable English while retaining their dates, source/version boundaries, material results and limitations. The original versions remain in Git history. The 88-row origin matrix retains the same file rows, source URLs, commit hashes, classifications and confidence boundaries. Translation does not grant rights or remove copyright obligations; LICENSE and published tags/assets are unchanged.

`npm run check:language` checks maintained prose and code for reintroduced Chinese text, with explicit source-language resource exceptions and multilingual query examples inside documentation code fences. It is a limited repository convention check, not automatic proof of English grammar or a ban on non-English data. Private, excluded working notes and immutable local audit evidence retain their source language.

Default relationship context and the local rule demo now present English labels. Complete labels/advice still count toward the existing budgets, so longer wording can cause whole items to be omitted. Record contents, scope, review permissions and snapshot schema are unchanged by the language migration. Explicit Chinese typed-context headers and generated locale options remain available.

This local update does not publish 1.6–1.9 milestones or rewrite historical release documentation on GitHub/npm. Final 2.0 packaging and publication follow their separate gates.
