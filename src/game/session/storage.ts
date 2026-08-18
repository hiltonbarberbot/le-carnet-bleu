import type { GameState, Story } from '../types'

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

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state)
}

export function restoreGameState(story: Story, serialized: string): GameState {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Stored game state is not valid JSON.')
  }
  if (!isRecord(value)) throw new Error('Stored game state is not an object.')
  if (value.schemaVersion !== 1) throw new Error(`Unsupported stored game schema ${String(value.schemaVersion)}.`)
  if (value.storyId !== story.id || value.seed !== story.seed) throw new Error('Stored game state belongs to a different story or seed.')

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
    const roleIds = new Set(story.characters.map(character => character.id))
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
  requireRecord(value, 'deliveries')
  const roster = value.roster as Record<string, unknown>
  const deliveries = value.deliveries as Record<string, unknown>
  for (const character of story.characters) {
    if (!isRecord(roster[character.id])) throw new Error(`Stored roster is missing ${character.id}.`)
    if (!isRecord(deliveries[character.id])) throw new Error(`Stored deliveries are missing ${character.id}.`)
    const delivery = deliveries[character.id] as Record<string, unknown>
    if (!['not_required', 'not_requested', 'queued', 'sending', 'delivered', 'failed'].includes(String(delivery.status))) {
      throw new Error(`Stored delivery for ${character.id} has invalid status.`)
    }
  }
  if (phase === 'prepared') return value as GameState

  requireString(value, 'startedAt')
  requireString(value, 'playPhase')
  requireArray(value, 'completedBeatIds')
  requireArray(value, 'revealedEvidenceIds')
  requireRecord(value, 'accusation')
  requireRecord(value, 'aiPerformances')
  if (typeof value.paused !== 'boolean') throw new Error('Stored game state has invalid paused flag.')
  if (phase === 'completed') requireString(value, 'completedAt')
  return value as GameState
}
