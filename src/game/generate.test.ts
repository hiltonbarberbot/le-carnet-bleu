import { describe, expect, it } from 'vitest'
import { generateGame } from './generate'
import {
  beginDelivery,
  completeGame,
  confirmRunBeat,
  createGame,
  createIdleState,
  getSetupBlockers,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  revealToTable,
  startBlackout,
  startGame,
  startInvestigation,
  toggleEvidence,
  updateAccusation,
  updateEnrolment,
  venueChecks,
} from './session/lifecycle'
import { restoreGameState, serializeGameState } from './session/storage'
import type { EnrollingGameState, PreparedGameState } from './types'
import { validateStory } from './story/compile'

const noAi = { aiControllers: false }

function enrolledGame(seed = 'lifecycle') {
  const story = generateGame(seed)
  let state = createGame(story, new Date('2026-08-17T17:00:00Z'), 'game-1')
  state = updateEnrolment(state, {
    hostName: 'Host',
    seats: state.setup.seats.map((seat, index) => ({
      ...seat,
      participantId: `human-${index + 1}`,
      humanName: `Player ${index + 1}`,
      privateAddress: `private:${index + 1}`,
      ready: true,
    })),
    venue: Object.fromEntries(venueChecks.map(check => [check.id, true])),
  })
  return { story, state }
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

  it('models six people as one host and five guests', () => {
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

  it('rejects missing canonical evidence', () => {
    const story = structuredClone(generateGame('broken'))
    story.timeline[0].evidence.push('missing-proof')
    expect(validateStory(story)).toContain('timeline beat 1 references missing evidence missing-proof')
  })

  it('rejects memories gated by a missing run-plan beat', () => {
    const story = structuredClone(generateGame('broken-unlock'))
    story.characters[0].memories[0].availableAfter = 'missing-beat'
    expect(validateStory(story)).toContain(`memory ${story.characters[0].memories[0].id} unlocks after missing run-plan beat missing-beat`)
  })
})

describe('truthful game lifecycle', () => {
  it('starts at idle with no game identity, assignments, deliveries, or timestamps', () => {
    const idle = createIdleState(generateGame('idle'))
    expect(idle).toEqual({ schemaVersion: 1, storyId: 'le-carnet-bleu', seed: 'idle', phase: 'idle' })
    expect('id' in idle).toBe(false)
  })

  it('keeps partial enrolment blocked and refuses unavailable AI fallback', () => {
    const story = generateGame('blocked')
    let state = createGame(story, new Date('2026-08-17T17:00:00Z'), 'game-blocked')
    state.setup.hostName = 'Host'
    state.setup.seats[0] = { ...state.setup.seats[0], allowAiFallback: true }
    expect(getSetupBlockers(story, state.setup, noAi)).toContain(`${story.characters[0].name} would require AI fallback, but this host has no AI controller runtime.`)
    expect(() => prepareGame(story, state, noAi)).toThrow(/AI fallback/)
  })

  it('prepares assignments without fabricating delivery outcomes', () => {
    const { story, state } = enrolledGame()
    const prepared = prepareGame(story, state, noAi, new Date('2026-08-17T17:05:00Z'))
    expect(prepared.phase).toBe('prepared')
    expect(Object.values(prepared.roster)).toHaveLength(5)
    expect(Object.values(prepared.deliveries).every(delivery => delivery.status === 'not_requested')).toBe(true)
    expect(Object.values(prepared.deliveries).every(delivery => !delivery.deliveredAt && !delivery.receipt)).toBe(true)
    expect(() => startGame(story, prepared)).toThrow(/dossier is not_requested/)
  })

  it('preserves queued, sending, failed, retried, and confirmed delivery states', () => {
    const { story, state } = enrolledGame('delivery')
    let prepared = prepareGame(story, state, noAi)
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
    const { story, state } = enrolledGame('playthrough')
    let prepared = deliverAll(prepareGame(story, state, noAi))
    let active = startGame(story, prepared, new Date('2026-08-17T18:00:00Z'))
    expect(active.phase).toBe('active')
    expect(active.playPhase).toBe('dinner')
    expect(() => startBlackout(story, active)).toThrow(/Dinner is missing/)
    for (const beat of story.runPlan.filter(beat => beat.phase === 'dinner' && beat.essential)) active = confirmRunBeat(story, active, beat.id)
    active = startBlackout(story, active)
    expect(() => startInvestigation(story, active)).toThrow(/murder scene is incomplete/i)
    for (const beat of story.runPlan.filter(beat => beat.phase === 'blackout' && beat.essential)) active = confirmRunBeat(story, active, beat.id)
    active = startInvestigation(story, active)
    for (const evidenceId of new Set(story.timeline.flatMap(beat => beat.evidence))) if (!active.revealedEvidenceIds.includes(evidenceId)) active = toggleEvidence(active, evidenceId)
    active = updateAccusation(active, { culprit: 'Jacques', motive: 'He believed he was framed.', chain: 'Jackets, terrace, blackout, confrontation.' })
    active = revealToTable(story, active)
    const completed = completeGame(active, new Date('2026-08-17T21:00:00Z'))
    expect(completed.phase).toBe('completed')
  })

  it('requires explicit reset and returns to true idle', () => {
    const { story, state } = enrolledGame('reset')
    expect(() => resetGame(story, createIdleState(story), true)).toThrow(/no game/)
    expect(() => resetGame(story, state, false)).toThrow(/explicit confirmation/)
    expect(resetGame(story, state, true)).toEqual(createIdleState(story))
  })

  it('restores the exact lifecycle state and rejects malformed storage', () => {
    const { story, state } = enrolledGame('storage')
    let prepared = prepareGame(story, state, noAi)
    prepared = requestDelivery(prepared, story.characters[0].id)
    const serialized = serializeGameState(prepared)
    expect(restoreGameState(story, serialized)).toEqual(prepared)
    expect(() => restoreGameState(story, '{"schemaVersion":1,"phase":"prepared"}')).toThrow()
    expect(() => restoreGameState(story, '{bad json')).toThrow(/valid JSON/)
  })
})

export type TestEnrollingState = EnrollingGameState
