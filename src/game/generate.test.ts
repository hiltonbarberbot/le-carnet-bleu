import { describe, expect, it } from 'vitest'
import { generateGame } from './generate'
import { createDemoGame } from './demo'
import {
  advanceAct,
  advanceHearing,
  beginDelivery,
  callAccusation,
  castVote,
  completeGame,
  confirmRunBeat,
  createGame,
  createIdleState,
  getSetupBlockers,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  startGame,
  toggleEvidence,
  updateEnrolment,
} from './session/lifecycle'
import { restoreGameState, serializeGameState } from './session/storage'
import type { EnrollingGameState, PreparedGameState } from './types'
import { validateStory } from './story/compile'

const noAi = { aiControllers: false }

function enrolledGame(seed = 'lifecycle') {
  const definition = createDemoGame(seed)
  const { story } = definition
  let state = createGame(definition, new Date('2026-08-17T17:00:00Z'), 'game-1')
  state = updateEnrolment(state, {
    peoplePlaying: 6,
    hostName: 'Host',
    seats: state.setup.seats.map((seat, index) => ({
      ...seat,
      participantId: `human-${index + 1}`,
      humanName: `Player ${index + 1}`,
      privateAddress: `private:${index + 1}`,
      ready: true,
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, true])),
  })
  return { definition, story, state }
}

function deliverAll(state: PreparedGameState) {
  let next = state
  for (const roleId of Object.keys(next.deliveries)) {
    next = requestDelivery(next, roleId, new Date('2026-08-17T17:10:00Z'))
    next = beginDelivery(next, roleId, new Date('2026-08-17T17:11:00Z'))
    next = recordDeliveryOutcome(next, roleId, { ok: true, receipt: `receipt:${roleId}` }, new Date('2026-08-17T17:12:00Z'))
  }
  return next
}

describe('story compilation', () => {
  it('is deterministic for a seed', () => expect(generateGame('bleu')).toEqual(generateGame('bleu')))

  it('models six roles as one host and five guests', () => {
    const story = generateGame('headcount')
    expect(story.totalPeople).toBe(6)
    expect(story.characters).toHaveLength(5)
  })

  it('has a valid evidence graph and executable essential actions', () => {
    const story = generateGame('coverage')
    expect(validateStory(story)).toEqual([])
    const planned = new Set(story.runPlan.flatMap(beat => beat.actionIds))
    const essential = story.characters.flatMap(character => character.actions).filter(action => action.essential)
    expect(essential.every(action => planned.has(action.id))).toBe(true)
  })

  it('does not make the present murder a recreation of an earlier crime', () => {
    const story = generateGame('fresh-incident')
    expect(JSON.stringify(story)).not.toMatch(/recreat|re-enact|reenact/i)
  })

  it('rejects an isolated suspect in the combined secrets-and-relationships graph', () => {
    const story = structuredClone(generateGame('isolated-suspect'))
    const isolatedId = story.characters[0].id
    for (const character of story.characters) {
      character.relationships = character.id === isolatedId ? [] : character.relationships.filter(relationship => relationship.roleId !== isolatedId)
      character.secrets = character.secrets.map(secret => ({
        ...secret,
        aboutRoleIds: character.id === isolatedId ? [] : (secret.aboutRoleIds ?? []).filter(roleId => roleId !== isolatedId),
      }))
    }
    expect(validateStory(story)).toContain('character secrets and relationships must form one connected social graph')
  })

  it('gives every guest a private invitation, identity, and objective without making them canonical evidence', () => {
    const story = generateGame('private-promises')
    for (const character of story.characters) {
      expect(character.invitationPretext).toBeTruthy()
      expect(character.invitationPromise).toMatch(/before midnight/i)
      expect(character.privateIdentity).toBeTruthy()
      expect(character.privateObjective).toBeTruthy()
    }
    const canonicalEvidence = new Set(story.timeline.flatMap(beat => beat.evidence))
    expect([...canonicalEvidence].some(id => /identity|invitation|promise|objective/.test(id))).toBe(false)
  })

  it('rejects missing canonical evidence', () => {
    const story = structuredClone(generateGame('broken'))
    story.timeline[0].evidence.push('missing-proof')
    expect(validateStory(story)).toContain('timeline beat 1 references missing evidence missing-proof')
  })

  it('requires two distinct non-purchasable evidence routes per truth beat', () => {
    const story = structuredClone(generateGame('duplicate-route'))
    story.timeline[0].evidence = [story.timeline[0].evidence[0], story.timeline[0].evidence[0]]
    expect(validateStory(story)).toContain('timeline beat 1 needs at least two non-purchasable evidence routes')
  })

  it('rejects secrets gated by a missing run-plan beat', () => {
    const story = structuredClone(generateGame('broken-unlock'))
    story.characters[0].secrets[0].availableAfter = 'missing-beat'
    expect(validateStory(story)).toContain(`secret ${story.characters[0].secrets[0].id} unlocks after missing run-plan beat missing-beat`)
  })
})

describe('truthful game lifecycle', () => {
  it('starts at idle with no game identity, assignments, deliveries, or timestamps', () => {
    const definition = createDemoGame('idle')
    const idle = createIdleState(definition)
    expect(idle).toEqual({ schemaVersion: 3, definitionFingerprint: definition.fingerprint, storyId: 'le-carnet-bleu', seed: 'idle', phase: 'idle' })
    expect('id' in idle).toBe(false)
  })

  it('keeps partial enrolment blocked and refuses unavailable AI fallback', () => {
    const definition = createDemoGame('blocked')
    const { story } = definition
    let state = createGame(definition, new Date('2026-08-17T17:00:00Z'), 'game-blocked')
    state.setup.peoplePlaying = 5
    state.setup.hostName = 'Host'
    state.setup.seats[0] = { ...state.setup.seats[0], allowAiFallback: true }
    expect(getSetupBlockers(definition, state.setup, noAi)).toContain(`${story.characters[0].name} would require AI fallback, but this host has no AI controller runtime.`)
    expect(() => prepareGame(definition, state, noAi)).toThrow(/AI fallback/)
  })

  it('prepares assignments without fabricating delivery outcomes', () => {
    const { definition, state } = enrolledGame()
    const prepared = prepareGame(definition, state, noAi, new Date('2026-08-17T17:05:00Z'))
    expect(prepared.phase).toBe('prepared')
    expect(Object.values(prepared.roster)).toHaveLength(5)
    expect(Object.values(prepared.deliveries).every(delivery => delivery.status === 'not_requested')).toBe(true)
    expect(Object.values(prepared.deliveries).every(delivery => !delivery.deliveredAt && !delivery.receipt)).toBe(true)
    expect(() => startGame(definition, prepared)).toThrow(/dossier is not_requested/)
  })

  it('preserves queued, sending, failed, retried, and confirmed delivery states', () => {
    const { definition, story, state } = enrolledGame('delivery')
    let prepared = prepareGame(definition, state, noAi)
    const roleId = story.characters[0].id
    prepared = requestDelivery(prepared, roleId, new Date('2026-08-17T17:10:00Z'))
    expect(prepared.deliveries[roleId].status).toBe('queued')
    expect(() => requestDelivery(prepared, roleId)).toThrow(/cannot be queued/)
    prepared = beginDelivery(prepared, roleId, new Date('2026-08-17T17:11:00Z'))
    expect(prepared.deliveries[roleId].status).toBe('sending')
    expect(() => recordDeliveryOutcome(prepared, roleId, { ok: true, receipt: '' })).toThrow(/receipt/)
    prepared = recordDeliveryOutcome(prepared, roleId, { ok: false, error: 'WhatsApp rejected recipient' }, new Date('2026-08-17T17:12:00Z'))
    expect(prepared.deliveries[roleId]).toMatchObject({ status: 'failed', attempts: 1, error: 'WhatsApp rejected recipient' })
    prepared = requestDelivery(prepared, roleId)
    prepared = beginDelivery(prepared, roleId)
    prepared = recordDeliveryOutcome(prepared, roleId, { ok: true, receipt: 'wamid.123' })
    expect(prepared.deliveries[roleId]).toMatchObject({ status: 'delivered', attempts: 2, receipt: 'wamid.123' })
  })

  it('runs a complete gated playthrough only after confirmed delivery', () => {
    const { definition, story, state } = enrolledGame('playthrough')
    let prepared = deliverAll(prepareGame(definition, state, noAi))
    let active = startGame(definition, prepared, new Date('2026-08-17T18:00:00Z'))
    expect(active.phase).toBe('active')
    expect(active.playPhase).toBe('opening')
    expect(() => advanceAct(definition, active)).toThrow(/last recording is missing/i)
    for (const beat of story.runPlan.filter(beat => beat.phase === 'opening' && beat.essential)) active = confirmRunBeat(definition, active, beat.id)
    active = advanceAct(definition, active)
    for (const evidenceId of new Set(story.timeline.flatMap(beat => beat.evidence))) if (!active.revealedEvidenceIds.includes(evidenceId)) active = toggleEvidence(active, evidenceId)
    active = callAccusation(active, 'gabriel', 'solange', 'The sixth envelope, carbon-copy label, and matching corner form one chain.')
    active = advanceHearing(active)
    active = advanceHearing(active)
    active = advanceHearing(active)
    for (const character of story.characters) active = castVote(definition, active, character.id, 'convict')
    const completed = completeGame(definition, active, new Date('2026-08-17T21:00:00Z'))
    expect(completed.phase).toBe('completed')
  })

  it('requires explicit reset and returns to true idle', () => {
    const { definition, state } = enrolledGame('reset')
    expect(() => resetGame(definition, createIdleState(definition), true)).toThrow(/no game/)
    expect(() => resetGame(definition, state, false)).toThrow(/explicit confirmation/)
    expect(resetGame(definition, state, true)).toEqual(createIdleState(definition))
  })

  it('restores the exact lifecycle state and rejects malformed storage', () => {
    const { definition, story, state } = enrolledGame('storage')
    let prepared = prepareGame(definition, state, noAi)
    prepared = requestDelivery(prepared, story.characters[0].id)
    const serialized = serializeGameState(definition, prepared)
    expect(restoreGameState(definition, serialized)).toEqual(prepared)
    expect(() => restoreGameState(definition, '{"schemaVersion":1,"phase":"prepared"}')).toThrow()
    expect(() => restoreGameState(definition, '{bad json')).toThrow(/valid JSON/)
  })
})

export type TestEnrollingState = EnrollingGameState
