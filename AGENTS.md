# Live mystery agent rules

This product is a setting-aware live mystery authoring system. Its public name comes from `game.manifest.json`; do not repeat it in application code. The Maison Bleue plot in this repository is a demo, not universal canon.

## Setting gate

Before drafting or adapting a storyline, creating a runtime, assigning characters, or proposing physical staging:

1. Check whether a validated `SettingBrief` already exists for this specific run.
2. If it does not, collect the required questions from `game.manifest.json` or `src/game/setting/brief.ts`.
3. Ask compact grouped questions and reuse facts the user has already supplied. Do not make them repeat known details.
4. Do not assume rooms, doors, terraces, lighting control, props, permissions, local history, mobility, privacy, or content boundaries.
5. Validate the answers with `createSettingBrief` before story work begins.

The minimum brief covers the real venue, location, fictional era, playable spaces, safe routes, tone, safety constraints, and content boundaries. Props, usable features, and accessibility needs must also be recorded when relevant. The in-fiction gathering and invitation are storyline facts generated after the real setting is validated; never ask for or store a separate real-world occasion.

## Authoring workflow

Use the functional pipeline:

`SettingBriefInput → createSettingBrief → createStoryAuthoringBrief → StorylineDefinitionInput → createStorylineDefinition → createGameRuntime`

- `createStoryAuthoringBrief` is the handoff for a human or generative agent drafting the mystery.
- `createGameDefinition` validates the evidence graph, authored acts, setting-backed setup requirements, physical-action dependencies, and content fingerprint.
- `createGameRuntime` requires an `AuthoredStoryline`; it must never silently fall back to the demo.
- `createDemoGame` exists only for development, tests, and product demonstration.

Every authored mystery must fit the verified setting, give all five suspects agency, use fair-play evidence, and keep physical actions no-contact and host-cued. Prefer functional composition and dependency injection over classes or hidden global configuration.

## Run artifacts

When persisting an authored run, keep its files together:

```text
story/runs/<cute-run-name>/
  setting.json
  story.json
  host-guide.md
  dossiers/
```

Never overwrite a setting brief with inferred details. Record a changed venue as a new run.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
