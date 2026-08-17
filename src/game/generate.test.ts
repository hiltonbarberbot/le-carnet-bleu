import { describe, expect, it } from 'vitest'
import { generateGame } from './generate'
import {
  completeGame,
  confirmRunBeat,
  createSetupDraft,
  getSetupBlockers,
  lockRoster,
  revealToTable,
  startBlackout,
  startDinner,
  startInvestigation,
  toggleEvidence,
  updateAccusation,
  venueChecks,
} from './session/lifecycle'
import { validateStory } from './story/compile'

function readySetup() {
  const story = generateGame('lifecycle')
  const setup = createSetupDraft(story)
  setup.hostName = 'Host'
  setup.seats = setup.seats.map((seat, index) => ({ ...seat, humanName: `Player ${index + 1}`, ready: true }))
  setup.venue = Object.fromEntries(venueChecks.map(check => [check.id, true]))
  return { story, setup }
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
})

describe('game lifecycle', () => {
  it('fails closed while people or venue requirements are missing', () => {
    const story = generateGame('blocked')
    expect(getSetupBlockers(story, createSetupDraft(story)).length).toBeGreaterThan(5)
  })

  it('does not pretend AI fallback exists without an AI runtime', () => {
    const story = generateGame('fallback')
    const setup = createSetupDraft(story)
    setup.hostName = 'Host'
    setup.seats[0].allowAiFallback = true
    setup.venue = Object.fromEntries(venueChecks.map(check => [check.id, true]))
    expect(getSetupBlockers(story, setup)).toContain(`${story.characters[0].name} would require AI fallback, but this build has no AI controller runtime.`)
  })

  it('runs a complete gated playthrough', () => {
    const { story, setup } = readySetup()
    let session = lockRoster(story, setup, new Date('2026-08-17T18:00:00Z'))
    expect(session.phase).toBe('lobby')
    expect(Object.values(session.roster)).toHaveLength(5)

    session = startDinner(session)
    expect(() => startBlackout(story, session)).toThrow(/Dinner is missing/)
    for (const beat of story.runPlan.filter(beat => beat.phase === 'dinner' && beat.essential)) {
      session = confirmRunBeat(story, session, beat.id)
    }

    session = startBlackout(story, session)
    expect(() => startInvestigation(story, session)).toThrow(/murder scene is incomplete/i)
    for (const beat of story.runPlan.filter(beat => beat.phase === 'blackout' && beat.essential)) {
      session = confirmRunBeat(story, session, beat.id)
    }

    session = startInvestigation(story, session)
    for (const evidenceId of new Set(story.timeline.flatMap(beat => beat.evidence))) {
      if (!session.revealedEvidenceIds.includes(evidenceId)) session = toggleEvidence(session, evidenceId)
    }
    session = updateAccusation(session, { culprit: 'Jacques', motive: 'He believed he was framed.', chain: 'Jackets, terrace, blackout, confrontation.' })
    session = revealToTable(story, session)
    session = completeGame(session, new Date('2026-08-17T21:00:00Z'))
    expect(session.phase).toBe('complete')
  })
})
