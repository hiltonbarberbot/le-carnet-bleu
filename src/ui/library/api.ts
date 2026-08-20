import type { GameCommand, GameEvent } from '../../game/application/commands'
import type { StorylineDefinition } from '../../game/definition/contract'
import type { PersistedGame } from '../../game/persistence/repository'
import type { ExistingGameState } from '../../game/types'
import { resumeStorylineCertification } from '../../game/ai/author'

type ApiErrorPayload = {
  error?: string
  code?: string
  game?: PersistedGame
}

export class LibraryApiError extends Error {
  readonly code?: string
  readonly currentGame?: PersistedGame

  constructor(message: string, payload: ApiErrorPayload = {}) {
    super(message)
    this.name = 'LibraryApiError'
    this.code = payload.code
    this.currentGame = payload.game
  }
}

async function apiJson<Result>(input: RequestInfo | URL, init?: RequestInit): Promise<Result> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => ({})) as Result & ApiErrorPayload
  if (!response.ok) {
    throw new LibraryApiError(payload.error || `The library request failed (${response.status}).`, payload)
  }
  return payload
}

export async function readRemoteStorylines() {
  const payload = await apiJson<{ storylines: StorylineDefinition[] }>('/api/storylines')
  return payload.storylines
}

export async function readRemoteGames() {
  const payload = await apiJson<{ games: PersistedGame[] }>('/api/games')
  return payload.games
}

export async function readRemoteGame(gameId: string) {
  const payload = await apiJson<{ game: PersistedGame }>(`/api/games/${encodeURIComponent(gameId)}`)
  return payload.game
}

export async function readRemoteIssueCode(gameId: string) {
  const payload = await apiJson<{ issueCode: string }>(`/api/games/${encodeURIComponent(gameId)}/issue-code`)
  return payload.issueCode
}

export async function certifyRemoteStoryline(storyline: StorylineDefinition) {
  const payload = await apiJson<{ jobId: string; status: 'pending' }>('/api/storylines', {
    method: 'POST',
    body: JSON.stringify(storyline),
  })
  return resumeStorylineCertification(payload.jobId)
}

export async function createRemoteGame(storylineFingerprint: string) {
  const payload = await apiJson<{ game: PersistedGame }>('/api/games', {
    method: 'POST',
    body: JSON.stringify({
      storylineFingerprint,
      host: { displayName: '' },
      participants: [],
    }),
  })
  return payload.game
}

export async function runRemoteGameCommand(
  gameId: string,
  expectedVersion: number,
  command: GameCommand,
) {
  return apiJson<{ game?: PersistedGame; events: GameEvent[]; deleted?: boolean }>(`/api/games/${encodeURIComponent(gameId)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion, command }),
  })
}

export async function importRemoteLibrary(
  storylines: StorylineDefinition[],
  sessions: Array<{ storyline: StorylineDefinition; state: ExistingGameState }>,
) {
  return apiJson<{ storylinesImported: number; gamesImported: number }>('/api/library/import', {
    method: 'POST',
    body: JSON.stringify({ storylines, sessions }),
  })
}
