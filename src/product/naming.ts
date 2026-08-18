import rawManifest from '../../game.manifest.json'
import type { GameManifest } from '../game/runtime/contract.js'

/**
 * Product-facing naming lives here. The manifest remains the single source of
 * truth so runtimes, the browser, persistence, and AI telemetry rename together.
 * The manifest id is a stable machine identifier; change `name` for a rebrand.
 */
export const gameManifest = rawManifest as GameManifest

export const productNaming = Object.freeze({
  id: gameManifest.id,
  name: gameManifest.name,
  uppercaseName: gameManifest.name.toLocaleUpperCase('en'),
  description: gameManifest.description,
  documentTitle: `${gameManifest.name} — murder mystery engine`,
  telemetryTag: gameManifest.id,
})

export const storageKeys = Object.freeze({
  storylines: `${productNaming.id}:storylines:v1`,
  games: `${productNaming.id}:games:v1`,
  legacyGame: `${productNaming.id}:game:v5`,
})
