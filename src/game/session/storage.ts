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

function requireExactKeys(record: Record<string, unknown>, expected: ReadonlySet<string>, label: string) {
  const actual = Object.keys(record)
  if (actual.length !== expected.size || actual.some(key => !expected.has(key))) throw new Error(`Stored ${label} does not exactly match the definition.`)
}

function requireStringIds(value: unknown, allowed: ReadonlySet<string>, label: string, unique = true): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error(`Stored ${label} contains an unknown id.`)
  if (unique && new Set(value).size !== value.length) throw new Error(`Stored ${label} contains duplicate ids.`)
  return value as string[]
}

function validateHearing(value: unknown, roleIds: ReadonlySet<string>, label: string) {
  if (!isRecord(value)) throw new Error(`Stored ${label} is invalid.`)
  if (!roleIds.has(String(value.accuserRoleId)) || !roleIds.has(String(value.accusedRoleId))) throw new Error(`Stored ${label} references an unknown role.`)
  if (!['case', 'defense', 'statements', 'voting'].includes(String(value.stage))) throw new Error(`Stored ${label} has an invalid stage.`)
  if (!isRecord(value.votes)) throw new Error(`Stored ${label} has invalid votes.`)
  for (const [roleId, vote] of Object.entries(value.votes)) if (!roleIds.has(roleId) || !['convict', 'acquit'].includes(String(vote))) throw new Error(`Stored ${label} has an invalid vote.`)
}

function frequency(ids: string[]) {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts].sort(([left], [right]) => left.localeCompare(right))
}

function restoreStateObject(definition: GameDefinition, value: unknown): GameState {
  if (!isRecord(value)) throw new Error('Stored game state is not an object.')
  if (value.schemaVersion !== 5) throw new Error(`Unsupported stored game schema ${String(value.schemaVersion)}.`)
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
    if (seats.length !== roleIds.size || new Set(seats.map(seat => isRecord(seat) ? String(seat.roleId) : '')).size !== roleIds.size || seats.some(seat => !isRecord(seat) || !roleIds.has(String(seat.roleId)))) {
      throw new Error('Stored enrolment does not contain exactly the story roles.')
    }
    requireExactKeys(setup.venue as Record<string, unknown>, new Set(definition.setupRequirements.map(item => item.id)), 'venue checks')
    if (Object.values(setup.venue as Record<string, unknown>).some(checked => typeof checked !== 'boolean')) throw new Error('Stored venue checks must be boolean.')
    return value as GameState
  }

  requireString(value, 'hostName')
  if (phase === 'aborted') {
    requireString(value, 'abortedAt')
    requireString(value, 'previousPhase')
    if (!['enrolling', 'prepared', 'active'].includes(String(value.previousPhase))) throw new Error('Stored aborted game has an invalid previous phase.')
    return value as GameState
  }

  requireString(value, 'preparedAt')
  requireRecord(value, 'roster')
  const roster = value.roster as Record<string, unknown>
  const roleIds = new Set(definition.story.characters.map(character => character.id))
  requireExactKeys(roster, roleIds, 'roster')
  for (const character of definition.story.characters) {
    if (!isRecord(roster[character.id])) throw new Error(`Stored roster is missing ${character.id}.`)
    if (!['human', 'ai', 'unassigned'].includes(String((roster[character.id] as Record<string, unknown>).kind))) throw new Error(`Stored roster controller for ${character.id} is invalid.`)
  }
  if (phase === 'prepared') return value as GameState

  requireString(value, 'startedAt')
  requireString(value, 'playPhase')
  const allowedPlayPhases = new Set([...definition.acts.map(act => act.id), 'investigation', 'reveal'])
  if (!allowedPlayPhases.has(String(value.playPhase))) throw new Error(`Stored game state has unknown play phase ${String(value.playPhase)}.`)
  const openingStepIds = new Set(definition.story.openingSteps.map(step => step.id))
  const completedStepIds = requireStringIds(value.completedStepIds, openingStepIds, 'completed opening steps')
  const expectedPrefix = definition.story.openingSteps.slice(0, completedStepIds.length).map(step => step.id)
  if (completedStepIds.some((id, index) => id !== expectedPrefix[index])) throw new Error('Stored opening steps are not a completed prefix of the authored order.')
  const evidenceIds = new Set([
    ...definition.story.publicEvidence.map(item => item.id),
    ...definition.story.characters.flatMap(character => character.secrets.map(secret => secret.id)),
  ])
  requireStringIds(value.revealedEvidenceIds, evidenceIds, 'revealed evidence')
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
  requireExactKeys(tokenBalances, roleIds, 'token balances')
  requireExactKeys(ownedClueIds, roleIds, 'clue ownership')
  requireExactKeys(completedObjectiveIds, roleIds, 'objective results')
  const allClueIds = new Set(definition.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id)))
  for (const character of definition.story.characters) {
    if (!Number.isInteger(tokenBalances[character.id]) || Number(tokenBalances[character.id]) < 0) throw new Error(`Stored token balance for ${character.id} is invalid.`)
    requireStringIds(ownedClueIds[character.id], allClueIds, `clues for ${character.id}`, false)
    requireStringIds(completedObjectiveIds[character.id], new Set(character.objectives.map(objective => objective.id)), `objective results for ${character.id}`)
  }
  const clueDecks = value.clueDecks as Record<string, unknown>
  requireExactKeys(clueDecks, new Set(definition.clueDecks.map(deck => deck.id)), 'clue decks')
  for (const deck of definition.clueDecks) {
    if (!isRecord(clueDecks[deck.id])) throw new Error(`Stored clue deck is missing ${deck.id}.`)
    const deckState = clueDecks[deck.id] as Record<string, unknown>
    const deckClueIds = new Set(deck.clues.map(clue => clue.id))
    const remaining = requireStringIds(deckState.remainingClueIds, deckClueIds, `${deck.id} remaining clues`)
    const drawn = requireStringIds(deckState.drawnClueIds, deckClueIds, `${deck.id} drawn clues`, !value.duplicateClues)
    if (!value.duplicateClues && new Set([...remaining, ...drawn]).size !== deckClueIds.size) throw new Error(`Stored clue deck ${deck.id} is not a complete partition.`)
  }
  const drawnClueIds = Object.values(clueDecks).flatMap(deck => isRecord(deck) && Array.isArray(deck.drawnClueIds) ? deck.drawnClueIds as string[] : [])
  const ownedClues = Object.values(ownedClueIds).flatMap(ids => ids as string[])
  if (canonicalState(frequency(drawnClueIds)) !== canonicalState(frequency(ownedClues))) throw new Error('Stored clue ownership does not match drawn clue history.')
  if (value.hearing !== null) validateHearing(value.hearing, roleIds, 'active hearing')
  for (const [index, hearing] of (value.hearingHistory as unknown[]).entries()) validateHearing(hearing, roleIds, `hearing history entry ${index + 1}`)
  if (value.outcome !== null) {
    const outcome = value.outcome as Record<string, unknown>
    if (outcome.kind === 'conviction' && (!roleIds.has(String(outcome.accusedRoleId)) || typeof outcome.hearingId !== 'string')) throw new Error('Stored conviction outcome is invalid.')
    if (!['conviction', 'time_expired'].includes(String(outcome.kind))) throw new Error('Stored outcome kind is invalid.')
  }
  const awards = value.awards as Record<string, unknown>
  for (const roleId of [awards.performanceRoleId, awards.costumeRoleId]) if (roleId !== undefined && !roleIds.has(String(roleId))) throw new Error('Stored award references an unknown role.')
  if (typeof value.paused !== 'boolean') throw new Error('Stored game state has invalid paused flag.')
  if (phase === 'completed') {
    requireString(value, 'completedAt')
    requireRecord(value, 'finalScores')
    const scores = value.finalScores as Record<string, unknown>
    requireExactKeys(scores, roleIds, 'final scores')
    for (const roleId of roleIds) if (!isRecord(scores[roleId]) || scores[roleId].roleId !== roleId) throw new Error(`Stored final score for ${roleId} is invalid.`)
  }
  return value as GameState
}

function canonicalState(value: unknown) {
  return JSON.stringify(value)
}

export function serializeGameState(definition: GameDefinition, state: GameState): string {
  if (state.definitionFingerprint !== definition.fingerprint) throw new Error('Cannot serialize state with a different game definition.')
  return JSON.stringify({ formatVersion: 3, definition, state })
}

export function restoreGameSession(serialized: string): { definition: GameDefinition; state: GameState } {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Stored game session is not valid JSON.')
  }
  if (!isRecord(value) || ![2, 3].includes(Number(value.formatVersion)) || !isRecord(value.definition)) {
    throw new Error('Stored game session has an unsupported envelope.')
  }
  const migratedAddressedInstructions = value.definition.schemaVersion === 5
  const definition = createGameDefinition(value.definition as unknown as GameDefinitionInput)
  const state = structuredClone(value.state)
  if (isRecord(state) && ((value.formatVersion === 2 && state.schemaVersion === 4) || migratedAddressedInstructions)) {
    if (state.schemaVersion === 4) state.schemaVersion = 5
    state.definitionFingerprint = definition.fingerprint
  }
  return { definition, state: restoreStateObject(definition, state) }
}

export function restoreGameState(expectedDefinition: GameDefinition, serialized: string): GameState {
  const restored = restoreGameSession(serialized)
  if (restored.definition.fingerprint !== expectedDefinition.fingerprint) {
    throw new Error('Stored game session belongs to a different authored definition.')
  }
  return restored.state
}
