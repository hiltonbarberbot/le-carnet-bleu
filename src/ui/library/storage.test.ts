import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../../game/demo'
import { createGame } from '../../game/session/lifecycle'
import { serializeGameState } from '../../game/session/storage'
import { bindGameToStoryline, GAMES_KEY, LEGACY_GAME_KEY, readGameLibrary, STORYLINES_KEY, writeGameLibrary } from './storage'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('storyline and game library storage', () => {
  it('includes every bundled storyline before local saves', () => {
    const first = createDemoGame('bundled-first')
    const second = createDemoGame('bundled-second')

    const restored = readGameLibrary(memoryStorage(), [first, second])

    expect(restored.storylines.map(storyline => storyline.fingerprint)).toEqual([first.fingerprint, second.fingerprint])
  })

  it('keeps several games linked to one reusable storyline', () => {
    const storage = memoryStorage()
    const storyline = createDemoGame('library')
    const first = createGame(storyline, new Date('2026-08-18T18:00:00Z'), 'blue-hour')
    const second = createGame(storyline, new Date('2026-08-19T18:00:00Z'), 'second-sitting')

    writeGameLibrary(storage, [storyline], [
      bindGameToStoryline(storyline, first),
      bindGameToStoryline(storyline, second),
    ])
    const restored = readGameLibrary(storage, [storyline])

    expect(restored.storylines).toHaveLength(1)
    expect(restored.games.map(game => game.state.id)).toEqual(['blue-hour', 'second-sitting'])
    expect(restored.games.every(game => game.storyline.fingerprint === storyline.fingerprint)).toBe(true)
  })

  it('rejects a game paired with any other storyline', () => {
    const firstStoryline = createDemoGame('first-storyline')
    const otherStoryline = createDemoGame('other-storyline')
    const game = createGame(firstStoryline, new Date('2026-08-18T18:00:00Z'), 'wrong-story')

    expect(() => bindGameToStoryline(otherStoryline, game)).toThrow('fingerprints do not match')
  })

  it('migrates the previous single-game save into the libraries', () => {
    const storyline = createDemoGame('legacy')
    const game = createGame(storyline, new Date('2026-08-18T18:00:00Z'), 'legacy-game')
    const storage = memoryStorage({ [LEGACY_GAME_KEY]: serializeGameState(storyline, game) })

    const restored = readGameLibrary(storage, [createDemoGame('browser-demo')])

    expect(restored.storylines.some(item => item.fingerprint === storyline.fingerprint)).toBe(true)
    expect(restored.games[0].state.id).toBe('legacy-game')
    writeGameLibrary(storage, restored.storylines, restored.games)
    expect(storage.getItem(LEGACY_GAME_KEY)).not.toBeNull()
    expect(storage.getItem(STORYLINES_KEY)).not.toBeNull()
    expect(storage.getItem(GAMES_KEY)).not.toBeNull()
  })

  it('keeps an incompatible legacy save without blocking the storyline library', () => {
    const storage = memoryStorage({ [LEGACY_GAME_KEY]: '{"obsolete":true}' })

    const restored = readGameLibrary(storage, [createDemoGame('browser-demo')])

    expect(restored.error).toBe('')
    expect(restored.warning).toContain('left untouched')
    expect(restored.storylines).toHaveLength(1)
    expect(storage.getItem(LEGACY_GAME_KEY)).toBe('{"obsolete":true}')
  })
})
