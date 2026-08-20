import type { GameManifest, PortableGameRuntime } from './contract'

export type DiscoveredGame = {
  manifest: GameManifest
  runtime: PortableGameRuntime
}

export function discoverGames(runtimes: PortableGameRuntime[]): DiscoveredGame[] {
  const seen = new Set<string>()
  return runtimes.map(runtime => {
    if (seen.has(runtime.storyline.fingerprint)) throw new Error(`Duplicate storyline ${runtime.storyline.id}.`)
    seen.add(runtime.storyline.fingerprint)
    return { manifest: runtime.manifest, runtime }
  })
}

export function findMatchingGames(runtimes: PortableGameRuntime[], selector: string): PortableGameRuntime[] {
  const wanted = selector.trim().toLowerCase()
  const exactStorylines = runtimes.filter(runtime => runtime.storyline.id.toLowerCase() === wanted
    || runtime.storyline.fingerprint.toLowerCase() === wanted)
  if (exactStorylines.length) return exactStorylines
  return runtimes.filter(runtime => runtime.manifest.id.toLowerCase() === wanted
    || runtime.manifest.name.toLowerCase() === wanted
    || runtime.manifest.aliases.some(alias => alias.toLowerCase() === wanted))
}

export function resolveGame(runtimes: PortableGameRuntime[], selector: string): PortableGameRuntime | null {
  const matches = findMatchingGames(runtimes, selector)
  return matches.length === 1 ? matches[0] : null
}
