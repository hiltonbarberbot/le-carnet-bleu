import { createStorylineDefinition } from '../../game/definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../../game/definition/contract'
import { restoreGameSession, serializeGameState } from '../../game/session/storage'
import type { ExistingGameState } from '../../game/types'
import { storageKeys } from '../../product/naming'

export const STORYLINES_KEY = storageKeys.storylines
export const GAMES_KEY = storageKeys.games
export const LEGACY_GAME_KEY = storageKeys.legacyGame

const gameStoryBinding: unique symbol = Symbol('gameStoryBinding')

export type GameSessionEntry = {
  storyline: StorylineDefinition
  state: ExistingGameState
  readonly [gameStoryBinding]: true
}

export function bindGameToStoryline(storyline: StorylineDefinition, state: ExistingGameState): GameSessionEntry {
  if (state.definitionFingerprint !== storyline.fingerprint) {
    throw new Error('Game and storyline fingerprints do not match.')
  }
  if (state.storyId !== storyline.story.id || state.seed !== storyline.story.seed) {
    throw new Error('Game does not belong to this storyline.')
  }
  return { storyline, state, [gameStoryBinding]: true }
}

export type GameLibrary = {
  storylines: StorylineDefinition[]
  games: GameSessionEntry[]
  error: string
  warning: string
}

type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function uniqueStorylines(storylines: StorylineDefinition[]) {
  return [...new Map(storylines.map(storyline => [storyline.fingerprint, storyline])).values()]
}

export function readGameLibrary(storage: LibraryStorage, demo: StorylineDefinition): GameLibrary {
  try {
    let warning = ''
    const storedStorylines = storage.getItem(STORYLINES_KEY)
    const storylines = storedStorylines
      ? (JSON.parse(storedStorylines) as StorylineDefinitionInput[]).map(createStorylineDefinition)
      : []
    const storedGames = storage.getItem(GAMES_KEY)
    const games = storedGames
      ? (JSON.parse(storedGames) as string[]).map(serialized => {
          const restored = restoreGameSession(serialized)
          if (restored.state.phase === 'idle') return undefined
          return bindGameToStoryline(restored.definition, restored.state)
        }).filter((entry): entry is GameSessionEntry => Boolean(entry))
      : []

    if (!storedStorylines && !storedGames) {
      const legacy = storage.getItem(LEGACY_GAME_KEY)
      if (legacy) {
        try {
          const restored = restoreGameSession(legacy)
          if (restored.state.phase !== 'idle') games.push(bindGameToStoryline(restored.definition, restored.state))
          storylines.push(restored.definition)
        } catch {
          warning = 'An older saved game could not be migrated to the current storyline format. It has been left untouched.'
        }
      }
    }

    return {
      storylines: uniqueStorylines([demo, ...storylines, ...games.map(game => game.storyline)]),
      games,
      error: '',
      warning,
    }
  } catch (error) {
    return {
      storylines: [demo],
      games: [],
      error: error instanceof Error ? error.message : String(error),
      warning: '',
    }
  }
}

export function writeGameLibrary(storage: LibraryStorage, storylines: StorylineDefinition[], games: GameSessionEntry[]) {
  storage.setItem(STORYLINES_KEY, JSON.stringify(uniqueStorylines(storylines)))
  storage.setItem(GAMES_KEY, JSON.stringify(games.map(game => {
    const bound = bindGameToStoryline(game.storyline, game.state)
    return serializeGameState(bound.storyline, bound.state)
  })))
}

export function clearGameLibrary(storage: LibraryStorage) {
  storage.removeItem(STORYLINES_KEY)
  storage.removeItem(GAMES_KEY)
  storage.removeItem(LEGACY_GAME_KEY)
}
