import type { StorylineDefinition } from '../definition/contract'
import type { ExistingGameState } from '../types'
import type { StorylineReadinessVerdict } from '../story/review/readiness'

export type LibraryScope = {
  ownerId: string
}

export type PersistedGame = {
  id: string
  storylineFingerprint: string
  version: number
  state: ExistingGameState
  createdAt: string
  updatedAt: string
}

export type NewPersistedGame = Omit<PersistedGame, 'version' | 'createdAt' | 'updatedAt'>

export type LibraryImport = {
  storylines: StorylineDefinition[]
  games: NewPersistedGame[]
}

export type LibraryImportResult = {
  storylinesImported: number
  gamesImported: number
}

/** Persistence port for one owner's storyline library and live game sessions. */
export type GameLibraryRepository = {
  listStorylines(scope: LibraryScope): Promise<StorylineDefinition[]>
  findStoryline(scope: LibraryScope, fingerprint: string): Promise<StorylineDefinition | undefined>
  findStorylineReadiness(scope: LibraryScope, fingerprint: string): Promise<StorylineReadinessVerdict | undefined>
  saveStoryline(scope: LibraryScope, storyline: StorylineDefinition): Promise<void>
  certifyStoryline(scope: LibraryScope, storyline: StorylineDefinition, readiness: StorylineReadinessVerdict): Promise<void>
  listGames(scope: LibraryScope): Promise<PersistedGame[]>
  findGame(scope: LibraryScope, id: string): Promise<PersistedGame | undefined>
  createGame(scope: LibraryScope, game: NewPersistedGame): Promise<PersistedGame>
  updateGame(
    scope: LibraryScope,
    id: string,
    expectedVersion: number,
    state: ExistingGameState,
  ): Promise<PersistedGame | undefined>
  deleteGame(scope: LibraryScope, id: string, expectedVersion: number): Promise<boolean>
  importLibrary(scope: LibraryScope, library: LibraryImport): Promise<LibraryImportResult>
}
