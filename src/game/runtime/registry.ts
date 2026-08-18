import type { GameManifest, PortableGameRuntime } from './contract'

export type DiscoveredGame = {
  manifest: GameManifest
  runtime: PortableGameRuntime
}

export function discoverGames(runtimes: PortableGameRuntime[]): DiscoveredGame[] {
  const seen = new Set<string>()
  return runtimes.map(runtime => {
    if (seen.has(runtime.manifest.id)) throw new Error(`Duplicate game id ${runtime.manifest.id}.`)
    seen.add(runtime.manifest.id)
    return { manifest: runtime.manifest, runtime }
  })
}

export function resolveGame(runtimes: PortableGameRuntime[], selector: string): PortableGameRuntime | null {
  const wanted = selector.trim().toLowerCase()
  return runtimes.find(runtime => runtime.manifest.id.toLowerCase() === wanted
    || runtime.manifest.name.toLowerCase() === wanted
    || runtime.manifest.aliases.some(alias => alias.toLowerCase() === wanted)) ?? null
}
