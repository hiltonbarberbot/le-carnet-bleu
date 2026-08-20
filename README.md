# Setting-aware live mystery engine

A setting-aware live dinner-party murder mystery system with one host role and five suspect roles. At setup, the host may add names to any roles, leave roles unassigned, or reuse a name; the app does not infer a real-world headcount.

The repository includes one Maison Bleue demo story and seven validated 1960s Grambois spy mysteries, but none is universal canon. A real run begins by learning the actual venue, usable spaces, safe routes, props, tone, accessibility needs, and content boundaries. The fictional gathering and invitations are generated with the story. Only then should a human or agent draft the mystery.

## Setting-first authoring

```ts
import {
  createGame,
  createGameRuntime,
  createSettingBrief,
  createStoryAuthoringBrief,
  createStorylineDefinition,
} from 'le-carnet-bleu/game'

const setting = createSettingBrief({
  venueName: 'The actual venue',
  location: 'Town and locally useful details',
  era: 'Present day',
  playableSpaces: ['Dining room', 'Library'],
  routes: ['Step-free hall between both rooms'],
  availableProps: [{
    id: 'blue-ledger',
    label: 'Blue ledger',
    description: 'An ordinary blank notebook prepared by the host',
    quantity: 1,
    safetyNotes: [],
  }],
  tone: 'Elegant social mystery',
  safetyConstraints: ['No darkness', 'No physical contact'],
  contentBoundaries: ['No harm to children'],
})

const agentBrief = createStoryAuthoringBrief(setting)
// A human or generative agent drafts a StorylineDefinitionInput from agentBrief.
const storyline = createStorylineDefinition(draftedStoryline)

// Reuse the immutable storyline for as many independent games as needed.
const firstGame = createGame(storyline)
const secondGame = createGame(storyline)
const runtime = createGameRuntime(storyline)
```

Storyline creation and game creation are separate lifecycle concepts. A storyline contains the validated mystery and setting; a game contains one evening's host, players, assignments, progress, and outcome. The browser persists a storyline library and can keep several games linked to the same storyline fingerprint.

All setting resources are first-class records with stable IDs: spaces, routes, features, props, safety constraints, accessibility needs, and content boundaries. Routes and features can name the spaces they depend on. Setup checks, clue sources, and opening steps use one `{ kind, id }` reference shape; prop links remain directly backlinkable through `getPropBacklinks(storyline)`. Every physical opening step also proves no contact, reversibility, a host cue, and who performs or proxies it. Imported legacy prose inventories are normalized, and all new exports persist schema v5.

Roles and evidence are equally explicit. The host, victim, and culprit are linked by stable role IDs rather than display names. Each solution step has its own ID, every evidence item records provenance and an independence group, and purchasable clues declare which solution steps they support. Runtime restoration verifies those IDs against the exact definition, including ordered opening progress, clue-deck partitions, objectives, roles, and revealed evidence.

Spoiler-rich God view and private dossier previews are game-scoped host tools. The storyline library exposes only safe metadata, game creation, rules, import, and export; it cannot open God view without a concrete game bound to that exact storyline fingerprint.

`createGameRuntime` has no silent default. Tests and product demonstrations must opt into `createDemoStoryline()` explicitly. Product naming is sourced from `game.manifest.json` and exposed through `src/product/naming.ts`.

The game opens with one short authored incident, then gets out of the players’ way. From the moment the body is discovered, it is built around one continuous loop: **objectives create demand for information, secrets and clues supply it, tokens make it scarce, bargaining forms coalitions, and a public accusation hearing tests them**.

## What is actually implemented

- Five private dossiers with traits, variable relationships, secrets, three scored objectives, live instructions, and optional name labels or AI controllers
- One explicit host/victim role and a complete host-only truth and clue-inventory view
- A validated, connected social and evidence graph plus one ordered, setting-specific cold open before free play
- Two setting-derived clue decks with five deterministic private clues, ten starting tokens per player, trades, and host pacing controls
- Player-called accusation hearings with a case, defense, open statements, a public vote, and a strict-majority conviction threshold
- Objective, token, accusation, vote, and culprit-escape scoring with separate overall, performance, and costume awards
- One persisted lifecycle: `idle → enrolling → prepared → active → completed | aborted`
- Direct role-specific dossier/PDF objectives with no fabricated account identity, address, receipt, or delivery claim
- Hard gates for definition fingerprint, setting-derived setup, fair-play evidence, and accusation outcomes
- A structured setting-resource and physical-prop ledger with validated forward links and derived preparation/opening-step backlinks
- Explicit, confirmed reset back to true idle; constructors and reloads never fabricate assignments, feed entries, or timestamps
- Optional, fail-closed Vercel AI Gateway controllers assigned only at `prepare`, after humans have had the entire enrolment window

The intended table rhythm follows the durable party-game architecture: private packets first, a brief murder setup, then one to three hours of player-led conversation. There are no guided acts after the body is discovered. The host keeps time, sells clues, arbitrates subjective objectives, and runs a hearing only when a player calls one.

AI-controlled roles use the same objectives, relationships, and secrets as human-controlled roles. The host owns the short opening checklist and any physical staging.

## Portable game contract

[`game.manifest.json`](./game.manifest.json) exposes the setting-first authoring questions and workflow alongside stable product identity, aliases, role slots, host capabilities, lifecycle phases, commands, and payload shapes without importing OpenClaw or WhatsApp.

The `./game` package export provides a functional runtime:

```ts
import { createDemoStoryline, createGameRuntime, discoverGames } from 'le-carnet-bleu/game'

const runtime = createGameRuntime(createDemoStoryline())
const installed = discoverGames([runtime])
const created = runtime.createSession({
  host: { displayName: 'Host' },
  participants: [
    { displayName: 'Alice' },
    { displayName: 'Bob' },
  ],
  allowAiFallback: true,
}, { capabilities: { aiControllers: true } })
```

The same interface owns input handling, event output, storyline-plus-state serialization, and strict restoration. `src/game/runtime/game.test.ts` advances a two-human/three-AI session through this public contract. The browser shows existing storylines, imports and exports the same fingerprinted storyline JSON, and lists every saved game beneath its source storyline.

## OpenClaw adapter

The `./openclaw` export is a generic adapter over any `PortableGameRuntime`; it contains no product-specific execution branches. It:

- enumerates installed manifests;
- resolves explicit selection or a channel/conversation binding;
- copies mentioned display names into editable role labels without treating chat metadata as game identity;
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

Coverage includes story and social-graph compilation, setting-backed clue and physical-staging checks, deterministic private clue draws, token trading, hearing outcomes, exact scoring, dossier privacy, a complete non-blackout gallery scenario, illegal lifecycle transitions, exact definition persistence, the portable runtime, OpenClaw routing, and fail-closed AI endpoints.

## Structure

- `src/game/setting/` — setting questions, normalization, and the mandatory authoring gate
- `src/game/definition/` — reusable storyline contracts, setting-backed setup requirements, validation, and fingerprints
- `src/game/props/` — physical-prop crosslinks and derived reverse indexes
- `src/game/scenario.ts` — Maison Bleue demo characters, objectives, evidence, solution steps, and ordered opening
- `src/game/story/` — agent authoring handoff and story graph validation
- `story/runs/` — validated setting, storyline, host guide, and dossier artifacts for authored runs
- `src/game/session/` — lifecycle transitions and exact persisted-state validation
- `src/game/runtime/` — host-agnostic contract, registry, and functional runtime implementation
- `src/product/` — product naming derived from the portable manifest
- `src/integrations/openclaw/` — generic chat discovery, routing, persistence, and output adapter
- `src/game/ai/` and `api/ai/` — bounded Vercel AI Gateway client/server integration
- `src/ui/App.tsx` — storyline library, individual game dashboards, and player dossiers projected from domain state
