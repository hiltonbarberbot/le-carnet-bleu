import { describe, expect, it } from 'vitest'
import { gameManifest, productNaming, storageKeys } from './naming'

describe('central product naming', () => {
  it('derives visible branding and machine namespaces from the manifest', () => {
    expect(productNaming).toMatchObject({
      id: gameManifest.id,
      name: gameManifest.name,
      description: gameManifest.description,
      telemetryTag: gameManifest.id,
    })
    expect(productNaming.uppercaseName).toBe(gameManifest.name.toLocaleUpperCase('en'))
    expect(productNaming.documentTitle).toContain(gameManifest.name)
    expect(storageKeys.storylines).toBe(`${gameManifest.id}:storylines:v1`)
    expect(storageKeys.games).toBe(`${gameManifest.id}:games:v1`)
  })
})
