# Optional character for casual chat

An application can give a fictional assistant a temporary mood and preferences that evolve with experience. The work-memory API and Agent MCP process do not read or expose this profile. A host integrating the SDK decides whether to offer it and runs the two conversation paths separately.

## Integrate it at the host boundary

```js
import {openCharacterProfile, createCharacterTurnRouter} from 'persona-memory';

const profile = await openCharacterProfile({
  id: 'studio-companion',
  file: './private/studio-companion.json',
});

const route = createCharacterTurnRouter({
  profile,
  runWork: ({text, workInput}) => workConversation.respond(text, workInput),
  runChat: ({text, character}) => casualConversation.respond(text, {character}),
});

await route({mode: 'chat', hasTask: false, text: 'Any ideas for a fun chat?'});
await route({mode: 'chat', hasTask: true, text: 'And run the tests.', workInput: {suite: 'core'}});
```

Select the mode in trusted application code before choosing a model history, work tools or model permissions. Allow casual expression only when the user deliberately enters chat and the host establishes that the turn contains no task. Mixed turns, missing mode and uncertainty use the work handler. Use distinct histories and never append chat output or character state to task context. Pass topic labels as data. The chat handler receives a mood and at most six topic preferences. It receives no work input, work tools or credentials from the router. Host-supplied handlers are responsible for keeping these boundaries throughout the application.

This is an opt-in SDK integration. Normal Codex and DSH MCP installations use work memory. See [the runnable local example](../examples/character-chat.js) for both routes.

## Feed observations with permission

```js
await profile.record({
  id: 'observation-014',
  sessionId: 'casual-session-004',
  topic: 'space mysteries',
  reaction: 'positive',
  channel: 'chat',
  at: Date.now(),
});
```

Use stable IDs and short labels. The host may explicitly approve a work milestone and pass only a topic and reaction via `approved-milestone`. Keep task text, identities and credentials out of labels. Host opt-in and milestone approval happen before calling `record`. The library stores the fields provided and performs no transcript collection, inference calls or external writes.

- A short-lived mood uses one latest reaction per recent session. Its influence decays with a 45-minute half-life and expires after four hours.
- A preference requires at least three distinct sessions with non-neutral reactions and a lead of at least two votes. Repeated messages in one session contribute one reaction per topic. Evidence can change or reverse a preference.
- The profile stores up to 128 observations and 64 KiB in a dedicated snapshot. Writes evict the oldest eligible observations when the byte or count bound is reached. The last 90 days are eligible for expression. Reads do not prune disk data. `inspect` returns retained eligible observations and supporting IDs so the owner can review them.
- `setFrozen(true)` pauses observations while retaining owner controls. Use `correct`, `forget` or `reset` to change or clear evidence. Forgotten IDs have bounded replay protection. An isolated file or compare-and-swap store preserves state across restarts and refuses conflicting writes. Without a file or store the profile is in-memory.

Guest character histories and work-memory snapshots have separate storage formats. Keep private character files outside the repository contents you distribute. The app chooses when to opt in, preserve a profile across sessions, or remove the dedicated file under its own data-retention policy.
