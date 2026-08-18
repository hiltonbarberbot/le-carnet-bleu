import type { GameManifest, PortableGameRuntime } from './contract'

export type DiscoveredGame = {
  manifest: GameManifest
  runtime: PortableGameRuntime
}

export function discoverGames(runtimes: PortableGameRuntime[]): DiscoveredGame[] {
  const seen = new Set<string>()
  return runtimes.map(runtime => {
    if (seen.has(runtime.authoredGame.definitionFingerprint)) throw new Error(`Duplicate game definition ${runtime.authoredGame.definitionId}.`)
    seen.add(runtime.authoredGame.definitionFingerprint)
    return { manifest: runtime.manifest, runtime }
  })
}

export function resolveGame(runtimes: PortableGameRuntime[], selector: string): PortableGameRuntime | null {
  const wanted = selector.trim().toLowerCase()
  const exactDefinition = runtimes.find(runtime => runtime.authoredGame.definitionId.toLowerCase() === wanted
    || runtime.authoredGame.definitionFingerprint.toLowerCase() === wanted)
  if (exactDefinition) return exactDefinition
  const matches = runtimes.filter(runtime => runtime.manifest.id.toLowerCase() === wanted
    || runtime.manifest.name.toLowerCase() === wanted
    || runtime.manifest.aliases.some(alias => alias.toLowerCase() === wanted))
  return matches.length === 1 ? matches[0] : null
}
