import { createGameDefinition } from '../definition/create.js'
import type { GameDefinition, GameDefinitionInput } from '../definition/contract.js'
import type { GameState } from '../types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== 'string' || !record[key]) throw new Error(`Stored game state is missing ${key}.`)
}

function requireRecord(record: Record<string, unknown>, key: string) {
  if (!isRecord(record[key])) throw new Error(`Stored game state has invalid ${key}.`)
}

function requireArray(record: Record<string, unknown>, key: string) {
  if (!Array.isArray(record[key])) throw new Error(`Stored game state has invalid ${key}.`)
}

function restoreStateObject(definition: GameDefinition, value: unknown): GameState {
  if (!isRecord(value)) throw new Error('Stored game state is not an object.')
  if (value.schemaVersion !== 3) throw new Error(`Unsupported stored game schema ${String(value.schemaVersion)}.`)
  if (value.definitionFingerprint !== definition.fingerprint) throw new Error('Stored game state belongs to a different game definition.')
  if (value.storyId !== definition.story.id || value.seed !== definition.story.seed) throw new Error('Stored game state belongs to a different story or seed.')

  const phase = value.phase
  if (!['idle', 'enrolling', 'prepared', 'active', 'completed', 'aborted'].includes(String(phase))) {
    throw new Error(`Stored game state has unknown phase ${String(phase)}.`)
  }
  if (phase === 'idle') return value as GameState

  requireString(value, 'id')
  requireString(value, 'createdAt')
  if (phase === 'enrolling') {
    requireRecord(value, 'setup')
    const setup = value.setup as Record<string, unknown>
    if (typeof setup.hostName !== 'string') throw new Error('Stored enrolment has invalid hostName.')
    requireArray(setup, 'seats')
    requireRecord(setup, 'venue')
    const roleIds = new Set(definition.story.characters.map(character => character.id))
    const seats = setup.seats as unknown[]
    if (seats.length !== roleIds.size || seats.some(seat => !isRecord(seat) || !roleIds.has(String(seat.roleId)))) {
      throw new Error('Stored enrolment does not contain exactly the story roles.')
    }
    return value as GameState
  }

  requireString(value, 'hostName')
  if (phase === 'aborted') {
    requireString(value, 'abortedAt')
    requireString(value, 'previousPhase')
    return value as GameState
  }

  requireString(value, 'preparedAt')
  requireRecord(value, 'roster')
  const roster = value.roster as Record<string, unknown>
  for (const character of definition.story.characters) {
    if (!isRecord(roster[character.id])) throw new Error(`Stored roster is missing ${character.id}.`)
  }
  if (phase === 'prepared') return value as GameState

  requireString(value, 'startedAt')
  requireString(value, 'playPhase')
  const allowedPlayPhases = new Set([...definition.acts.map(act => act.id), 'investigation', 'reveal'])
  if (!allowedPlayPhases.has(String(value.playPhase))) throw new Error(`Stored game state has unknown play phase ${String(value.playPhase)}.`)
  requireArray(value, 'completedBeatIds')
  requireArray(value, 'revealedEvidenceIds')
  requireRecord(value, 'tokenBalances')
  requireRecord(value, 'ownedClueIds')
  requireRecord(value, 'clueDecks')
  requireRecord(value, 'completedObjectiveIds')
  requireArray(value, 'hearingHistory')
  requireRecord(value, 'awards')
  if (value.hearing !== null && !isRecord(value.hearing)) throw new Error('Stored game state has invalid hearing.')
  if (value.outcome !== null && !isRecord(value.outcome)) throw new Error('Stored game state has invalid outcome.')
  if (!Number.isInteger(value.cluePrice) || Number(value.cluePrice) < 0) throw new Error('Stored game state has invalid cluePrice.')
  if (typeof value.duplicateClues !== 'boolean') throw new Error('Stored game state has invalid duplicateClues flag.')
  const tokenBalances = value.tokenBalances as Record<string, unknown>
  const ownedClueIds = value.ownedClueIds as Record<string, unknown>
  const completedObjectiveIds = value.completedObjectiveIds as Record<string, unknown>
  for (const character of definition.story.characters) {
    if (!Number.isInteger(tokenBalances[character.id]) || Number(tokenBalances[character.id]) < 0) throw new Error(`Stored token balance for ${character.id} is invalid.`)
    if (!Array.isArray(ownedClueIds[character.id])) throw new Error(`Stored clues are missing ${character.id}.`)
    if (!Array.isArray(completedObjectiveIds[character.id])) throw new Error(`Stored objective results are missing ${character.id}.`)
  }
  const clueDecks = value.clueDecks as Record<string, unknown>
  for (const deck of definition.clueDecks) {
    if (!isRecord(clueDecks[deck.id])) throw new Error(`Stored clue deck is missing ${deck.id}.`)
  }
  requireRecord(value, 'aiPerformances')
  if (typeof value.paused !== 'boolean') throw new Error('Stored game state has invalid paused flag.')
  if (phase === 'completed') {
    requireString(value, 'completedAt')
    requireRecord(value, 'finalScores')
  }
  return value as GameState
}

export function serializeGameState(definition: GameDefinition, state: GameState): string {
  if (state.definitionFingerprint !== definition.fingerprint) throw new Error('Cannot serialize state with a different game definition.')
  return JSON.stringify({ formatVersion: 2, definition, state })
}

export function restoreGameSession(serialized: string): { definition: GameDefinition; state: GameState } {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Stored game session is not valid JSON.')
  }
  if (!isRecord(value) || value.formatVersion !== 2 || !isRecord(value.definition)) {
    throw new Error('Stored game session has an unsupported envelope.')
  }
  const definition = createGameDefinition(value.definition as unknown as GameDefinitionInput)
  return { definition, state: restoreStateObject(definition, value.state) }
}

export function restoreGameState(expectedDefinition: GameDefinition, serialized: string): GameState {
  const restored = restoreGameSession(serialized)
  if (restored.definition.fingerprint !== expectedDefinition.fingerprint) {
    throw new Error('Stored game session belongs to a different authored definition.')
  }
  return restored.state
}
