import { describe, expect, it } from 'vitest'
import { generateGame } from './generate'
import { createDemoGame } from './demo'
import {
  advanceAct,
  advanceHearing,
  callAccusation,
  castVote,
  completeGame,
  completeOpeningStep,
  createGame,
  createIdleState,
  getSetupBlockers,
  prepareGame,
  resetGame,
  startGame,
  toggleEvidence,
  updateEnrolment,
} from './session/lifecycle'
import { restoreGameState, serializeGameState } from './session/storage'
import type { EnrollingGameState } from './types'
import { validateStory } from './story/compile'

const noAi = { aiControllers: false }

function enrolledGame(seed = 'lifecycle') {
  const definition = createDemoGame(seed)
  const { story } = definition
  let state = createGame(definition, new Date('2026-08-17T17:00:00Z'), 'game-1')
  state = updateEnrolment(state, {
    hostName: 'Host',
    seats: state.setup.seats.map((seat, index) => ({
      ...seat,
      humanName: `Player ${index + 1}`,
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, true])),
  })
  return { definition, story, state }
}

describe('story compilation', () => {
  it('is deterministic for a seed', () => expect(generateGame('bleu')).toEqual(generateGame('bleu')))

  it('models six roles as one host and five guests', () => {
    const story = generateGame('headcount')
    expect(story.totalPeople).toBe(6)
    expect(story.characters).toHaveLength(5)
  })

  it('has a valid evidence graph and one ordered opening checklist', () => {
    const story = generateGame('coverage')
    expect(validateStory(story)).toEqual([])
    expect(story.openingSteps.length).toBeGreaterThan(0)
    expect(story.characters.every(character => character.objectives.length === 3)).toBe(true)
    expect(JSON.stringify(story)).not.toContain('actionIds')
    expect(JSON.stringify(story.characters)).not.toContain('"actions"')
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
    const canonicalEvidence = new Set(story.solutionSteps.flatMap(step => step.evidence))
    expect([...canonicalEvidence].some(id => /identity|invitation|promise|objective/.test(id))).toBe(false)
  })

  it('rejects missing canonical evidence', () => {
    const story = structuredClone(generateGame('broken'))
    story.solutionSteps[0].evidence.push('missing-proof')
    expect(validateStory(story)).toContain('solution step 1 references missing evidence missing-proof')
  })

  it('requires two distinct non-purchasable evidence routes per solution step', () => {
    const story = structuredClone(generateGame('duplicate-route'))
    story.solutionSteps[0].evidence = [story.solutionSteps[0].evidence[0], story.solutionSteps[0].evidence[0]]
    expect(validateStory(story)).toContain('solution step 1 needs at least two independent non-purchasable evidence routes')
  })

  it('rejects duplicate opening step ids', () => {
    const story = structuredClone(generateGame('duplicate-opening-step'))
    story.openingSteps[1].id = story.openingSteps[0].id
    expect(validateStory(story)).toContain(`duplicate opening step id ${story.openingSteps[0].id}`)
  })
})

describe('truthful game lifecycle', () => {
  it('starts at idle with no game identity, assignments, or timestamps', () => {
    const definition = createDemoGame('idle')
    const idle = createIdleState(definition)
    expect(idle).toEqual({ schemaVersion: 5, definitionFingerprint: definition.fingerprint, storyId: 'le-carnet-bleu', seed: 'idle', phase: 'idle' })
    expect('id' in idle).toBe(false)
  })

  it('keeps partial enrolment blocked and refuses unavailable AI fallback', () => {
    const definition = createDemoGame('blocked')
    const { story } = definition
    let state = createGame(definition, new Date('2026-08-17T17:00:00Z'), 'game-blocked')
    state.setup.hostName = 'Host'
    state.setup.seats[0] = { ...state.setup.seats[0], allowAiFallback: true }
    expect(getSetupBlockers(definition, state.setup, noAi)).toContain(`${story.characters[0].name} would require AI fallback, but this host has no AI controller runtime.`)
    expect(() => prepareGame(definition, state, noAi)).toThrow(/AI fallback/)
  })

  it('prepares only the supplied assignment labels', () => {
    const { definition, state } = enrolledGame()
    const prepared = prepareGame(definition, state, noAi, new Date('2026-08-17T17:05:00Z'))
    expect(prepared.phase).toBe('prepared')
    expect(Object.values(prepared.roster)).toHaveLength(5)
    expect(Object.values(prepared.roster).map(controller => controller.displayName)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'])
    expect('deliveries' in prepared).toBe(false)
    expect(startGame(definition, prepared).phase).toBe('active')
  })

  it('allows repeated names and leaves blank roles explicitly unassigned', () => {
    const { definition, state } = enrolledGame('labels')
    state.setup.seats[0].humanName = 'Alex'
    state.setup.seats[1].humanName = 'Alex'
    state.setup.seats[2].humanName = ''
    const prepared = prepareGame(definition, state, noAi)
    expect(prepared.roster[state.setup.seats[0].roleId].displayName).toBe('Alex')
    expect(prepared.roster[state.setup.seats[1].roleId].displayName).toBe('Alex')
    expect(prepared.roster[state.setup.seats[2].roleId]).toEqual({ kind: 'unassigned', displayName: 'Unassigned' })
  })

  it('runs a complete playthrough from role labels', () => {
    const { definition, story, state } = enrolledGame('playthrough')
    const prepared = prepareGame(definition, state, noAi)
    let active = startGame(definition, prepared, new Date('2026-08-17T18:00:00Z'))
    expect(active.phase).toBe('active')
    expect(active.playPhase).toBe('opening')
    expect(() => advanceAct(definition, active)).toThrow(/last recording is missing/i)
    for (const step of story.openingSteps) active = completeOpeningStep(definition, active, step.id)
    active = advanceAct(definition, active)
    for (const evidenceId of new Set(story.solutionSteps.flatMap(step => step.evidence))) if (!active.revealedEvidenceIds.includes(evidenceId)) active = toggleEvidence(definition, active, evidenceId)
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
    const { definition, state } = enrolledGame('storage')
    const prepared = prepareGame(definition, state, noAi)
    const serialized = serializeGameState(definition, prepared)
    expect(restoreGameState(definition, serialized)).toEqual(prepared)
    expect(() => restoreGameState(definition, '{"schemaVersion":1,"phase":"prepared"}')).toThrow()
    expect(() => restoreGameState(definition, '{bad json')).toThrow(/valid JSON/)
  })

  it('rejects runtime references that are absent from the definition', () => {
    const { definition, state } = enrolledGame('reference-integrity')
    let active = startGame(definition, prepareGame(definition, state, noAi))
    for (const step of definition.story.openingSteps) active = completeOpeningStep(definition, active, step.id)
    active = advanceAct(definition, active)
    expect(() => toggleEvidence(definition, active, 'invented-evidence')).toThrow(/Unknown evidence/)

    const envelope = JSON.parse(serializeGameState(definition, active))
    envelope.state.completedStepIds = ['invented-step']
    expect(() => restoreGameState(definition, JSON.stringify(envelope))).toThrow(/unknown id/)
  })
})

export type TestEnrollingState = EnrollingGameState
