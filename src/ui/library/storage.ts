import { createStorylineDefinition } from '../../game/definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../../game/definition/contract'
import { restoreGameSession, serializeGameState } from '../../game/session/storage'
import type { ExistingGameState } from '../../game/types'
import { storageKeys } from '../../product/naming'

export const STORYLINES_KEY = storageKeys.storylines
export const GAMES_KEY = storageKeys.games
export const LEGACY_GAME_KEY = storageKeys.legacyGame

export type GameSessionEntry = {
  storyline: StorylineDefinition
  state: ExistingGameState
}

export type GameLibrary = {
  storylines: StorylineDefinition[]
  games: GameSessionEntry[]
  error: string
}

type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function uniqueStorylines(storylines: StorylineDefinition[]) {
  return [...new Map(storylines.map(storyline => [storyline.fingerprint, storyline])).values()]
}

export function readGameLibrary(storage: LibraryStorage, demo: StorylineDefinition): GameLibrary {
  try {
    const storedStorylines = storage.getItem(STORYLINES_KEY)
    const storylines = storedStorylines
      ? (JSON.parse(storedStorylines) as StorylineDefinitionInput[]).map(createStorylineDefinition)
      : []
    const storedGames = storage.getItem(GAMES_KEY)
    const games = storedGames
      ? (JSON.parse(storedGames) as string[]).map(serialized => {
          const restored = restoreGameSession(serialized)
          if (restored.state.phase === 'idle') return undefined
          return { storyline: restored.definition, state: restored.state }
        }).filter((entry): entry is GameSessionEntry => Boolean(entry))
      : []

    if (!storedStorylines && !storedGames) {
      const legacy = storage.getItem(LEGACY_GAME_KEY)
      if (legacy) {
        const restored = restoreGameSession(legacy)
        if (restored.state.phase !== 'idle') games.push({ storyline: restored.definition, state: restored.state })
        storylines.push(restored.definition)
      }
    }

    return {
      storylines: uniqueStorylines([demo, ...storylines, ...games.map(game => game.storyline)]),
      games,
      error: '',
    }
  } catch (error) {
    return {
      storylines: [demo],
      games: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function writeGameLibrary(storage: LibraryStorage, storylines: StorylineDefinition[], games: GameSessionEntry[]) {
  storage.setItem(STORYLINES_KEY, JSON.stringify(uniqueStorylines(storylines)))
  storage.setItem(GAMES_KEY, JSON.stringify(games.map(game => serializeGameState(game.storyline, game.state))))
  storage.removeItem(LEGACY_GAME_KEY)
}

export function clearGameLibrary(storage: LibraryStorage) {
  storage.removeItem(STORYLINES_KEY)
  storage.removeItem(GAMES_KEY)
  storage.removeItem(LEGACY_GAME_KEY)
}
