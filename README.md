# Le Carnet Bleu

A six-person live dinner-party murder mystery: one host performs Le Maître Concierge and becomes Game Master after the murder; five guest seats play the suspects.

The game is built around one rule: **memories describe what a character knows, actions create what happens tonight, and the canonical timeline connects both**.

## What is actually implemented

- Five private dossiers with identities, secrets, evidence, live instructions, and distinct human or AI controllers
- One explicit host/Concierge role and a complete God-mode truth view
- A validated evidence graph and dependency-aware dinner/blackout run plan
- One persisted lifecycle: `idle → enrolling → prepared → active → completed | aborted`
- A delivery state machine: `not_requested → queued → sending → delivered | failed`
- Hard gates for roster identity, private addresses, venue setup, confirmed dossier delivery, causal beats, surfaced evidence, and the final accusation
- Explicit, confirmed reset back to true idle; constructors and reloads never fabricate assignments, deliveries, feed entries, or timestamps
- Optional, fail-closed Vercel AI Gateway controllers assigned only at `prepare`, after humans have had the entire enrolment window

AI output is restricted to a short line for an authored role action. It cannot invent actions or perform physical staging. A named human proxy owns every physical beat. The generated line is persisted in game state, and the domain refuses to confirm that beat until the line exists.

## Portable game contract

[`game.manifest.json`](./game.manifest.json) exposes stable identity, aliases, human-player constraints, required/optional host capabilities, lifecycle phases, commands, and payload shapes without importing OpenClaw or WhatsApp.

The `./game` package export provides a functional runtime:

```ts
import { createLeCarnetBleuRuntime, discoverGames } from 'le-carnet-bleu/game'

const runtime = createLeCarnetBleuRuntime()
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

The same interface owns input handling, event output, serialization, and strict restoration. `src/game/runtime/le-carnet-bleu.test.ts` advances a two-human/three-AI session through this public contract.

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

Coverage includes story compilation, illegal lifecycle transitions, idle and partial enrolment UI, unsent and failed delivery UI, active/reset UI, exact persistence, the portable two-human runtime, the generic OpenClaw bound/unbound paths, and the fail-closed AI endpoint.

## Structure

- `src/game/scenario.ts` — authored characters, evidence, actions, timeline, and run plan
- `src/game/story/compile.ts` — story graph validation
- `src/game/session/` — lifecycle transitions and exact persisted-state validation
- `src/game/runtime/` — host-agnostic contract, registry, and Le Carnet Bleu implementation
- `src/integrations/openclaw/` — generic chat discovery, routing, persistence, and output adapter
- `src/game/ai/` and `api/ai/` — bounded Vercel AI Gateway client/server integration
- `src/ui/App.tsx` — God mode and player dossiers projected from domain state
