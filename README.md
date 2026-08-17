# Le Carnet Bleu

A six-person live dinner-party murder mystery: one host performs Le Maître Concierge and becomes Game Master after the murder; five guests play the suspects.

The game is built around one rule: **memories describe what a character knows, actions create what happens tonight, and the canonical timeline connects both**.

## Included

- Five private player dossiers with identities, secrets, evidence and live instructions
- One explicit host/Concierge role
- A validated canonical timeline with two evidence routes per beat
- An ordered, dependency-aware dinner and blackout run plan
- Fail-closed roster and venue preparation
- A gated lifecycle from lobby through dinner, murder, investigation, reveal and completion
- Investigation evidence tracking and one locked group accusation
- Print-friendly dossiers and browser-local session recovery

AI fallback is represented as a roster policy but intentionally fails closed: this repository has no AI controller runtime yet. A conversational AI also cannot own a physical action without an explicit host proxy or transformed beat.

## Develop

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

## Structure

- `src/game/scenario.ts` contains authored characters, evidence, actions, timeline and run plan.
- `src/game/story/compile.ts` rejects broken evidence, dependencies and unplanned essential actions.
- `src/game/session/lifecycle.ts` owns setup gates, roster lock and legal game transitions.
- `src/ui/App.tsx` projects God mode and player dossiers from that domain state.
