import { executeGameCommand } from '../application/execute-command'
import { createGameRuntime } from '../runtime/game'
import type { CreateSessionRequest, GameCommand, RuntimeCapabilities, RuntimeEvent } from '../runtime/contract'
import {
  type StorylineReadinessVerdict,
} from '../story/review/readiness'
import { createGramboisCatalog } from '../story/grambois/catalog'
import {
  createBundledStorylinePassport,
  storylinePlayabilityPassportPassed,
  validateStorylinePlayabilityPassport,
} from '../story/grambois/passport'
import type { StorylineDefinition } from '../definition/contract'
import type {
  GameLibraryRepository,
  LibraryImportResult,
  LibraryScope,
  PersistedGame,
} from './repository'
import { validatePersistedGameState, validatePersistedStoryline } from './validate'

export type ImportedSession = {
  storyline: unknown
  state: unknown
}

function uniqueStorylines(storylines: StorylineDefinition[]) {
  return [...new Map(storylines.map(storyline => [storyline.fingerprint, storyline])).values()]
}

export async function listAvailableStorylines(
  repository: GameLibraryRepository,
  scope: LibraryScope,
) {
  const candidates = await repository.listStorylines(scope)
  const playable: StorylineDefinition[] = []
  for (const storyline of candidates) {
    try {
      await requirePlayableStoryline(repository, scope, storyline)
      playable.push(storyline)
    } catch (error) {
      if (!(error instanceof StorylineNotPlayableError)) throw error
    }
  }
  return playable
}

export async function findAvailableStoryline(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  fingerprint: string,
) {
  const storyline = await repository.findStoryline(scope, fingerprint)
  if (!storyline) return undefined
  await requirePlayableStoryline(repository, scope, storyline)
  return storyline
}

export class StorylineNotPlayableError extends Error {
  readonly code = 'storyline_not_playable'

  constructor(message = 'This storyline has not passed the complete playability gate.') {
    super(message)
    this.name = 'StorylineNotPlayableError'
  }
}

async function requirePlayableStoryline(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  storyline: StorylineDefinition,
) {
  const readiness = await repository.findStorylineReadiness(scope, storyline.fingerprint)
  const errors = readiness
    ? validateStorylinePlayabilityPassport(storyline, readiness)
    : ['playability passport is missing']
  if (!readiness || errors.length || !storylinePlayabilityPassportPassed(storyline, readiness)) {
    throw new StorylineNotPlayableError(
      `This storyline cannot be played: ${errors.join('; ') || 'one or more playability gates did not pass'}`,
    )
  }
  return readiness
}

export async function saveValidatedStoryline(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  input: unknown,
) {
  const storyline = validatePersistedStoryline(input)
  await repository.saveStoryline(scope, storyline)
  return storyline
}

export async function certifyValidatedStoryline(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  input: unknown,
  readiness: StorylineReadinessVerdict,
) {
  const storyline = validatePersistedStoryline(input)
  const errors = validateStorylinePlayabilityPassport(storyline, readiness)
  if (errors.length || !storylinePlayabilityPassportPassed(storyline, readiness)) {
    throw new StorylineNotPlayableError(
      `The playability passport is invalid: ${errors.join('; ') || 'one or more gates did not pass'}`,
    )
  }
  await repository.certifyStoryline(scope, storyline, readiness)
  return storyline
}

/** Restores the version-controlled mysteries that shipped with the original browser library. */
export async function publishBundledStorylines(
  repository: GameLibraryRepository,
  scope: LibraryScope,
) {
  for (const storyline of createGramboisCatalog()) {
    const existing = await repository.findStorylineReadiness(scope, storyline.fingerprint)
    if (existing && storylinePlayabilityPassportPassed(storyline, existing)) continue
    await repository.certifyStoryline(
      scope,
      storyline,
      createBundledStorylinePassport(storyline),
    )
  }
}

export async function createPersistedGame(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  input: {
    storylineFingerprint: string
    session: CreateSessionRequest
    capabilities?: Partial<RuntimeCapabilities>
  },
) {
  const storyline = await findAvailableStoryline(repository, scope, input.storylineFingerprint)
  if (!storyline) return undefined

  const runtime = createGameRuntime(storyline)
  const result = runtime.createSession(input.session, {
    capabilities: { aiControllers: Boolean(input.capabilities?.aiControllers) },
  })
  if (result.state.phase === 'idle') throw new Error('The runtime did not create a game session.')
  return repository.createGame(scope, {
    id: result.state.id,
    storylineFingerprint: storyline.fingerprint,
    state: result.state,
  })
}

export async function executePersistedGameCommand(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  input: {
    game: PersistedGame
    expectedVersion: number
    command: GameCommand
    capabilities?: Partial<RuntimeCapabilities>
  },
): Promise<{ game?: PersistedGame; deleted?: true; events: RuntimeEvent[] }> {
  const storyline = await repository.findStoryline(scope, input.game.storylineFingerprint)
  if (!storyline) throw new Error('The game references a missing storyline.')
  await requirePlayableStoryline(repository, scope, storyline)
  const result = executeGameCommand({
    storyline,
    state: input.game.state,
    command: input.command,
    context: {
      capabilities: { aiControllers: Boolean(input.capabilities?.aiControllers) },
    },
  })
  if (result.state.phase === 'idle') {
    const deleted = await repository.deleteGame(scope, input.game.id, input.expectedVersion)
    return { deleted: deleted ? true : undefined, events: result.events }
  }
  if (result.state.id !== input.game.id) throw new Error('A game command cannot change the session id.')
  const state = validatePersistedGameState(storyline, result.state)
  const game = await repository.updateGame(
    scope,
    input.game.id,
    input.expectedVersion,
    state,
  )
  return { game, events: result.events }
}

export async function importPersistedLibrary(
  repository: GameLibraryRepository,
  scope: LibraryScope,
  input: { storylines?: unknown; sessions?: unknown },
): Promise<LibraryImportResult> {
  if (!Array.isArray(input.storylines)) throw new Error('storylines must be an array.')
  if (!Array.isArray(input.sessions)) throw new Error('sessions must be an array.')

  // Validate the entire import before beginning its single database write.
  const storylines = uniqueStorylines(input.storylines.map(validatePersistedStoryline))
  const storylinesByFingerprint = new Map(storylines.map(storyline => [storyline.fingerprint, storyline]))

  for (const item of input.sessions as ImportedSession[]) {
    if (!item || typeof item !== 'object') throw new Error('Every imported session must be an object.')
    const storyline = validatePersistedStoryline(item.storyline)
    storylinesByFingerprint.set(storyline.fingerprint, storyline)
    validatePersistedGameState(storyline, item.state)
  }

  // Legacy definitions are deliberately quarantined. A browser snapshot has no
  // durable playability passport, so importing its live sessions would bypass
  // the same gate that protects newly generated games.
  return repository.importLibrary(scope, {
    storylines: [...storylinesByFingerprint.values()],
    games: [],
  })
}
