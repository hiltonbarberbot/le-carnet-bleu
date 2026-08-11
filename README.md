# Le Carnet Bleu

A seed-driven engine for live dinner-party murder mysteries where **memories describe the past, actions create the present, and the solution requires both**.

The included first case is a ridiculous French espionage story played completely straight. The host begins in character as Le Maître Concierge. The guests perform secret live actions; then a blackout turns those absurd actions into the first half of the crime scene.

## Included

- Six private player dossiers with identities, secrets, memories and live instructions
- One deterministic canonical timeline with evidence coverage
- Host run-sheet and live action checklist
- Seeded, reproducible case ordering and shareable seed URLs
- Print-friendly dossiers
- Unit tests for determinism and timeline coverage

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

## Data model

The scenario lives in `src/game/scenario.ts`. The engine treats the canonical timeline as the source of truth, then distributes its evidence into character memories and actions. Every essential beat is tested for coverage.

This is an initial playable release. Planned next: a case editor, configurable cast size, private player links, and generation from reusable scenario templates.
