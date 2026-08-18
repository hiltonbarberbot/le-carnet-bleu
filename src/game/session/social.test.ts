import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../demo'
import type { ActiveGameState, PreparedGameState } from '../types'
import {
  advanceAct,
  advanceHearing,
  beginDelivery,
  buyClue,
  callAccusation,
  castVote,
  completeGame,
  confirmRunBeat,
  createGame,
  enableDuplicateClues,
  endInvestigation,
  getConvictionThreshold,
  lowerCluePrice,
  prepareGame,
  recordAward,
  recordDeliveryOutcome,
  requestDelivery,
  setObjectiveCompleted,
  SOCIAL_RULES,
  startGame,
  transferTokens,
  updateEnrolment,
} from './lifecycle'

function deliverAll(state: PreparedGameState) {
  let next = state
  for (const roleId of Object.keys(next.deliveries)) {
    next = requestDelivery(next, roleId)
    next = beginDelivery(next, roleId)
    next = recordDeliveryOutcome(next, roleId, { ok: true, receipt: `receipt:${roleId}` })
  }
  return next
}

function openInvestigation(seed = 'social-loop') {
  const definition = createDemoGame(seed)
  let enrolling = createGame(definition, new Date('2026-08-18T17:00:00Z'), `game-${seed}`)
  enrolling = updateEnrolment(enrolling, {
    peoplePlaying: 6,
    hostName: 'Host',
    seats: enrolling.setup.seats.map((seat, index) => ({
      ...seat,
      participantId: `human-${index + 1}`,
      humanName: `Player ${index + 1}`,
      privateAddress: `private:${index + 1}`,
      ready: true,
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(requirement => [requirement.id, true])),
  })
  let active = startGame(definition, deliverAll(prepareGame(definition, enrolling, { aiControllers: false })))
  for (const act of definition.acts) {
    for (const beat of definition.story.runPlan.filter(beat => beat.phase === act.id && beat.essential)) {
      active = confirmRunBeat(definition, active, beat.id)
    }
    active = advanceAct(definition, active)
  }
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
    const bought = buyClue(first.definition, first.active, 'jacques', deckId)
    expect(bought.tokenBalances.jacques).toBe(5)
    expect(bought.ownedClueIds.jacques).toEqual([expectedClueId])
    expect(bought.ownedClueIds.madame).toEqual([])
    expect(bought.clueDecks[deckId].remainingClueIds).not.toContain(expectedClueId)
  })

  it('supports bargaining transfers, depletion, lower prices, and host-enabled duplicates', () => {
    const { definition, active: initial } = openInvestigation('market-controls')
    let active = transferTokens(initial, 'jacques', 'madame', 3)
    expect(active.tokenBalances).toMatchObject({ jacques: 7, madame: 13 })
    expect(() => transferTokens(active, 'jacques', 'pierre', 8)).toThrow(/does not have 8 tokens/)

    const deckId = definition.clueDecks.find(deck => deck.clues.length === 2)!.id
    active = buyClue(definition, active, 'madame', deckId)
    active = buyClue(definition, active, 'pierre', deckId)
    expect(() => buyClue(definition, active, 'francois', deckId)).toThrow(/no clues left/)

    active = lowerCluePrice(active, 2)
    active = enableDuplicateClues(active)
    active = buyClue(definition, active, 'francois', deckId)
    expect(active.tokenBalances.francois).toBe(8)
    expect(active.ownedClueIds.francois).toHaveLength(1)
    expect(definition.clueDecks.find(deck => deck.id === deckId)!.clues.map(clue => clue.id)).toContain(active.ownedClueIds.francois[0])
  })
})

describe('public accusation hearings and scoring', () => {
  it('derives a strict-majority threshold from the authored cast', () => {
    expect(getConvictionThreshold(createDemoGame('majority'))).toBe(3)
  })

  it('returns to investigation after a failed five-player vote', () => {
    const { definition, active: initial } = openInvestigation('failed-hearing')
    let active = callAccusation(initial, 'francois', 'jacques', 'The missing page points to Jacques.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['jacques', 'convict'],
      ['madame', 'convict'],
      ['francois', 'acquit'],
      ['pierre', 'acquit'],
      ['amelie', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)
    expect(active).toMatchObject({ playPhase: 'investigation', hearing: null, outcome: null })
    expect(active.hearingHistory.at(-1)).toMatchObject({ result: 'failed', convictVotes: 2 })
  })

  it('ends on a strict-majority correct conviction and applies every applicable source weight', () => {
    const { definition, active: initial } = openInvestigation('correct-conviction')
    const objective = definition.story.characters.find(character => character.id === 'francois')!.objectives[0]
    let active = setObjectiveCompleted(definition, initial, 'francois', objective.id, true)
    active = callAccusation(active, 'francois', 'jacques', 'The jacket switch, missing leaf, and garden trace form one chain.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['jacques', 'acquit'],
      ['madame', 'convict'],
      ['francois', 'convict'],
      ['pierre', 'convict'],
      ['amelie', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)

    expect(active).toMatchObject({ playPhase: 'reveal', outcome: { kind: 'conviction', accusedRoleId: 'jacques' } })
    const completed = completeGame(definition, active)
    expect(completed.finalScores.francois).toMatchObject({
      objectivePoints: objective.points,
      tokenPoints: 2,
      accuserPoints: SOCIAL_RULES.correctAccuserPoints,
      votePoints: SOCIAL_RULES.correctVotePoints,
      culpritEscapePoints: 0,
      total: objective.points + 10,
    })
    expect(completed.finalScores.madame.votePoints).toBe(3)
    expect(completed.finalScores.amelie.votePoints).toBe(0)
  })

  it('ends on a wrongful conviction and awards the culprit ten escape points', () => {
    const { definition, active: initial } = openInvestigation('wrongful-conviction')
    let active = callAccusation(initial, 'pierre', 'madame', 'The engraved prop and letters make Hélène look guilty.')
    active = moveHearingToVoting(active)
    for (const [roleId, vote] of [
      ['jacques', 'convict'],
      ['madame', 'acquit'],
      ['francois', 'convict'],
      ['pierre', 'convict'],
      ['amelie', 'acquit'],
    ] as const) active = castVote(definition, active, roleId, vote)
    active = recordAward(definition, active, 'performance', 'amelie')
    active = recordAward(definition, active, 'costume', 'madame')
    const completed = completeGame(definition, active)
    expect(completed.finalScores.jacques).toMatchObject({ tokenPoints: 2, culpritEscapePoints: 10, total: 12 })
    expect(completed.finalScores.pierre.accuserPoints).toBe(0)
    expect(completed.awards).toEqual({ performanceRoleId: 'amelie', costumeRoleId: 'madame' })
  })

  it('can end on time without inventing a conviction', () => {
    const { definition, active } = openInvestigation('time-expiry')
    const revealed = endInvestigation(active)
    expect(revealed.outcome).toEqual({ kind: 'time_expired' })
    const completed = completeGame(definition, revealed)
    expect(Object.values(completed.finalScores).every(score => score.accuserPoints === 0 && score.votePoints === 0 && score.culpritEscapePoints === 0)).toBe(true)
  })
})
