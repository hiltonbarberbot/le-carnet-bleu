import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import type { ActiveGameState } from '../types'
import {
  advanceAct,
  advanceHearing,
  buyClue,
  callAccusation,
  castVote,
  completeGame,
  completeOpeningStep,
  createGame,
  enableDuplicateClues,
  endInvestigation,
  getConvictionThreshold,
  lowerCluePrice,
  prepareGame,
  recordAward,
  setObjectiveCompleted,
  SOCIAL_RULES,
  startGame,
  transferTokens,
  updateEnrolment,
} from './lifecycle'

function openInvestigation(seed = 'social-loop') {
  const definition = createDemoStoryline(seed)
  let enrolling = createGame(definition, new Date('2026-08-18T17:00:00Z'), `game-${seed}`)
  enrolling = updateEnrolment(enrolling, {
    hostName: 'Host',
    seats: enrolling.setup.seats.map((seat, index) => ({
      ...seat,
      humanName: `Player ${index + 1}`,
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(requirement => [requirement.id, true])),
  })
  let active = startGame(definition, prepareGame(definition, enrolling, { aiControllers: false }))
  for (const step of definition.story.openingSteps) active = completeOpeningStep(definition, active, step.id)
  active = advanceAct(definition, active)
  expect(active.playPhase).toBe('investigation')
  return { definition, active }
}

function moveHearingToVoting(active: ActiveGameState) {
  let next = active
  next = advanceHearing(next)
  next = advanceHearing(next)
  next = advanceHearing(next)
  return next
}

describe('social investigation economy', () => {
  it('shuffles decks deterministically and keeps draws private', () => {
    const first = openInvestigation('repeatable-clues')
    const second = openInvestigation('repeatable-clues')
    expect(first.active.clueDecks).toEqual(second.active.clueDecks)

    const deckId = first.definition.clueDecks[0].id
    const expectedClueId = first.active.clueDecks[deckId].remainingClueIds[0]
    const bought = buyClue(first.definition, first.active, 'solange', deckId)
    expect(bought.tokenBalances.solange).toBe(5)
    expect(bought.ownedClueIds.solange).toEqual([expectedClueId])
    expect(bought.ownedClueIds.mathilde).toEqual([])
    expect(bought.clueDecks[deckId].remainingClueIds).not.toContain(expectedClueId)
  })

  it('supports bargaining transfers, depletion, lower prices, and host-enabled duplicates', () => {
    const { definition, active: initial } = openInvestigation('market-controls')
    let active = transferTokens(initial, 'solange', 'mathilde', 3)
    expect(active.tokenBalances).toMatchObject({ solange: 7, mathilde: 13 })
    expect(() => transferTokens(active, 'solange', 'remy', 8)).toThrow(/does not have 8 tokens/)

    const deckId = definition.clueDecks.find(deck => deck.clues.length === 2)!.id
    active = buyClue(definition, active, 'mathilde', deckId)
    active = buyClue(definition, active, 'remy', deckId)
    expect(() => buyClue(definition, active, 'gabriel', deckId)).toThrow(/no clues left/)

    active = lowerCluePrice(active, 2)
    active = enableDuplicateClues(active)
    active = buyClue(definition, active, 'gabriel', deckId)
    expect(active.tokenBalances.gabriel).toBe(8)
    expect(active.ownedClueIds.gabriel).toHaveLength(1)
    expect(definition.clueDecks.find(deck => deck.id === deckId)!.clues.map(clue => clue.id)).toContain(active.ownedClueIds.gabriel[0])
  })
})

describe('public accusation hearings and scoring', () => {
  it('derives a strict-majority threshold from the authored cast', () => {
    expect(getConvictionThreshold(createDemoStoryline('majority'))).toBe(3)
  })

  it('returns to investigation after a failed five-player vote', () => {
    const { definition, active: initial } = openInvestigation('failed-hearing')
    let active = callAccusation(initial, 'gabriel', 'solange', 'The sixth envelope points to Solange.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['solange', 'convict'],
      ['mathilde', 'convict'],
      ['gabriel', 'acquit'],
      ['remy', 'acquit'],
      ['colette', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)
    expect(active).toMatchObject({ playPhase: 'investigation', hearing: null, outcome: null })
    expect(active.hearingHistory.at(-1)).toMatchObject({ result: 'failed', convictVotes: 2 })
  })

  it('ends on a strict-majority correct conviction and applies every applicable source weight', () => {
    const { definition, active: initial } = openInvestigation('correct-conviction')
    const objective = definition.story.characters.find(character => character.id === 'gabriel')!.objectives[0]
    let active = setObjectiveCompleted(definition, initial, 'gabriel', objective.id, true)
    active = callAccusation(active, 'gabriel', 'solange', 'The sixth envelope, carbon-copy label, and matching corner form one chain.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['solange', 'acquit'],
      ['mathilde', 'convict'],
      ['gabriel', 'convict'],
      ['remy', 'convict'],
      ['colette', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)

    expect(active).toMatchObject({ playPhase: 'reveal', outcome: { kind: 'conviction', accusedRoleId: 'solange' } })
    const completed = completeGame(definition, active)
    expect(completed.finalScores.gabriel).toMatchObject({
      objectivePoints: objective.points,
      tokenPoints: 2,
      accuserPoints: SOCIAL_RULES.correctAccuserPoints,
      votePoints: SOCIAL_RULES.correctVotePoints,
      culpritEscapePoints: 0,
      total: objective.points + 10,
    })
    expect(completed.finalScores.mathilde.votePoints).toBe(3)
    expect(completed.finalScores.colette.votePoints).toBe(0)
  })

  it('ends on a wrongful conviction and awards the culprit ten escape points', () => {
    const { definition, active: initial } = openInvestigation('wrongful-conviction')
    let active = callAccusation(initial, 'remy', 'mathilde', 'The carbon-copy address and threat make Mathilde look guilty.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['solange', 'convict'],
      ['mathilde', 'acquit'],
      ['gabriel', 'convict'],
      ['remy', 'convict'],
      ['colette', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)
    active = recordAward(definition, active, 'performance', 'colette')
    active = recordAward(definition, active, 'costume', 'mathilde')
    const completed = completeGame(definition, active)
    expect(completed.finalScores.solange).toMatchObject({ tokenPoints: 2, culpritEscapePoints: 10, total: 12 })
    expect(completed.finalScores.remy.accuserPoints).toBe(0)
    expect(completed.awards).toEqual({ performanceRoleId: 'colette', costumeRoleId: 'mathilde' })
  })

  it('can end on time without inventing a conviction', () => {
    const { definition, active } = openInvestigation('time-expiry')
    const revealed = endInvestigation(active)
    expect(revealed.outcome).toEqual({ kind: 'time_expired' })
    const completed = completeGame(definition, revealed)
    expect(Object.values(completed.finalScores).every(score => score.accuserPoints === 0 && score.votePoints === 0 && score.culpritEscapePoints === 0)).toBe(true)
  })
})
