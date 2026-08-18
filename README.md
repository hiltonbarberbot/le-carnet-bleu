# Le Carnet Bleu

A setting-aware, six-person live dinner-party murder mystery system: one host performs the victim and becomes Game Master after the staged murder; five guest seats play the suspects.

The repository includes one Maison Bleue demo story, but it is not universal canon. A real run begins by learning the actual venue, occasion, usable spaces, safe routes, props, tone, accessibility needs, and content boundaries. Only then should a human or agent draft the mystery.

## Setting-first authoring

```ts
import {
  createGameDefinition,
  createLeCarnetBleuRuntime,
  createSettingBrief,
  createStoryAuthoringBrief,
} from 'le-carnet-bleu/game'

const setting = createSettingBrief({
  venueName: 'The actual venue',
  location: 'Town and locally useful details',
  occasion: 'Why everyone is gathering',
  era: 'Present day',
  playableSpaces: ['Dining room', 'Library'],
  routes: ['Step-free hall between both rooms'],
  tone: 'Elegant social mystery',
  safetyConstraints: ['No darkness', 'No physical contact'],
  contentBoundaries: ['No harm to children'],
})

const agentBrief = createStoryAuthoringBrief(setting)
// A human or generative agent drafts a GameDefinitionInput from agentBrief.
const game = createGameDefinition(draftedDefinition)
const runtime = createLeCarnetBleuRuntime(game)
```

`createLeCarnetBleuRuntime` has no silent default. Tests and product demonstrations must opt into `createDemoGame()` explicitly.

The game is built around one loop: **objectives create demand for information, secrets and clues supply it, tokens make it scarce, bargaining forms coalitions, and a public accusation hearing tests them**.

## What is actually implemented

- Five private dossiers with traits, variable relationships, secrets, three scored objectives, live instructions, and distinct human or AI controllers
- One explicit host/victim role and a complete host-only truth and clue-inventory view
- A validated, connected social and evidence graph plus a dependency-aware sequence of setting-specific authored acts
- Two setting-derived clue decks with five deterministic private clues, ten starting tokens per player, trades, and host pacing controls
- Player-called accusation hearings with a case, defense, open statements, a five-player vote, and a 3-of-5 conviction threshold
- Objective, token, accusation, vote, and culprit-escape scoring with separate overall, performance, and costume awards
- One persisted lifecycle: `idle → enrolling → prepared → active → completed | aborted`
- A delivery state machine: `not_requested → queued → sending → delivered | failed`
- Hard gates for definition fingerprint, roster identity, private addresses, setting-derived setup, confirmed dossier delivery, causal beats, fair-play evidence, and accusation outcomes
- Explicit, confirmed reset back to true idle; constructors and reloads never fabricate assignments, deliveries, feed entries, or timestamps
- Optional, fail-closed Vercel AI Gateway controllers assigned only at `prepare`, after humans have had the entire enrolment window

AI output is restricted to a short line for an authored role action. It cannot invent actions or perform physical staging. A named human proxy owns every physical beat. The generated line is persisted in game state, and the domain refuses to confirm that beat until the line exists.

## Portable game contract

[`game.manifest.json`](./game.manifest.json) exposes the setting-first authoring questions and workflow alongside stable identity, aliases, human-player constraints, host capabilities, lifecycle phases, commands, and payload shapes without importing OpenClaw or WhatsApp.

The `./game` package export provides a functional runtime:

```ts
import { createDemoGame, createLeCarnetBleuRuntime, discoverGames } from 'le-carnet-bleu/game'

const runtime = createLeCarnetBleuRuntime(createDemoGame())
const installed = discoverGames([runtime])
const created = runtime.createSession({
  host: { id: 'host', displayName: 'Host', privateAddress: 'local:host' },
  participants: [
    { id: 'alice', displayName: 'Alice', privateAddress: 'local:alice' },
    { id: 'bob', displayName: 'Bob', privateAddress: 'local:bob' },
  ],
  allowAiFallback: true,
}, { capabilities: { aiControllers: true } })
```

The same interface owns input handling, event output, definition-plus-state serialization, and strict restoration. `src/game/runtime/le-carnet-bleu.test.ts` advances a two-human/three-AI session through this public contract. The browser can import and export the same fingerprinted definition JSON.

## OpenClaw adapter

The `./openclaw` export is a generic adapter over any `PortableGameRuntime`; it contains no Le Carnet Bleu execution branches. It:

- enumerates installed manifests;
- resolves explicit selection or a channel/conversation binding;
- retains mentioned chat humans as distinct participant identities and private addresses;
- persists one serialized runtime state per conversation;
- passes structured game commands through the portable interface;
- renders runtime events back to the channel; and
- returns precise missing-game and missing-capability errors.

“Installed and playable generally” is verified by the portable runtime tests. “Available through OpenClaw” additionally requires registering the runtime with `createOpenClawGameAdapter`, providing a durable `ChatSessionStore`, and optionally binding the WhatsApp Game conversation to `le-carnet-bleu`. An unbound conversation can still list games and select `carnet bleu` explicitly.

## Develop

```bash
npm install
npm run dev
```

For local AI players, copy `.env.example` to `.env.local`, set `AI_GATEWAY_API_KEY`, and run `vercel dev` so Vite and `/api/ai/perform` are served together. Vercel deployments can authenticate to AI Gateway with OIDC. `AI_GATEWAY_MODEL` is optional.

## Verify

```bash
npm test
npm run build
```

Coverage includes story and social-graph compilation, setting-backed clue and physical-action checks, deterministic private clue draws, token trading, hearing outcomes, exact scoring, dossier privacy, a complete non-blackout gallery scenario, illegal lifecycle transitions, exact definition persistence, the portable runtime, OpenClaw routing, and fail-closed AI endpoints.

## Structure

- `src/game/setting/` — setting questions, normalization, and the mandatory authoring gate
- `src/game/definition/` — authored acts, setting-backed setup requirements, validation, and fingerprints
- `src/game/scenario.ts` — Maison Bleue demo characters, evidence, actions, timeline, and run plan
- `src/game/story/` — agent authoring handoff and story graph validation
- `src/game/session/` — lifecycle transitions and exact persisted-state validation
- `src/game/runtime/` — host-agnostic contract, registry, and Le Carnet Bleu implementation
- `src/integrations/openclaw/` — generic chat discovery, routing, persistence, and output adapter
- `src/game/ai/` and `api/ai/` — bounded Vercel AI Gateway client/server integration
- `src/ui/App.tsx` — God mode and player dossiers projected from domain state
