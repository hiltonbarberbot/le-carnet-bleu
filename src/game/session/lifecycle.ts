import type {
  AccusationVote,
  ActiveGameState,
  Controller,
  EnrollingGameState,
  ExistingGameState,
  GameState,
  IdleGameState,
  PreparedGameState,
  RunBeat,
  RuntimeCapabilities,
  ScoreCard,
  SeatDraft,
  SetupDraft,
} from '../types'
import type { GameDefinition } from '../definition/contract'
import { hashString } from '../random/hash'

export const SOCIAL_RULES = {
  startingTokens: 10,
  initialCluePrice: 5,
  tokenPointDivisor: 5,
  correctAccuserPoints: 5,
  correctVotePoints: 3,
  culpritEscapePoints: 10,
} as const

export function getConvictionThreshold(definition: GameDefinition) {
  return Math.floor(definition.story.characters.length / 2) + 1
}

export const browserCapabilities: RuntimeCapabilities = {
  aiControllers: false,
}

export function createSetupDraft(definition: GameDefinition): SetupDraft {
  const { story } = definition
  return {
    hostName: '',
    seats: story.characters.map<SeatDraft>(character => ({
      roleId: character.id,
      humanName: '',
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, false])),
  }
}

export function createIdleState(definition: GameDefinition): IdleGameState {
  return { schemaVersion: 3, definitionFingerprint: definition.fingerprint, storyId: definition.story.id, seed: definition.story.seed, phase: 'idle' }
}

export function createGame(definition: GameDefinition, now = new Date(), id: string = crypto.randomUUID()): EnrollingGameState {
  return {
    ...createIdleState(definition),
    phase: 'enrolling',
    id,
    createdAt: now.toISOString(),
    setup: createSetupDraft(definition),
  }
}

export function updateEnrolment(state: EnrollingGameState, setup: SetupDraft): EnrollingGameState {
  return { ...state, setup }
}

export function getSetupBlockers(definition: GameDefinition, setup: SetupDraft, capabilities: RuntimeCapabilities): string[] {
  const { story } = definition
  const blockers: string[] = []
  if (!setup.hostName.trim()) blockers.push(`The host for “${story.hostRole}” has not been named.`)

  for (const character of story.characters) {
    const seat = setup.seats.find(item => item.roleId === character.id)
    if (!seat) {
      blockers.push(`${character.name} has no seat configuration.`)
      continue
    }

    if (seat.allowAiFallback && !capabilities.aiControllers) {
      blockers.push(`${character.name} would require AI fallback, but this host has no AI controller runtime.`)
    }
  }

  for (const check of definition.setupRequirements) {
    if (!setup.venue[check.id]) blockers.push(`Venue requirement missing: ${check.label}`)
  }

  return blockers
}

export function prepareGame(
  definition: GameDefinition,
  state: EnrollingGameState,
  capabilities: RuntimeCapabilities,
  now = new Date(),
): PreparedGameState {
  const { story } = definition
  const blockers = getSetupBlockers(definition, state.setup, capabilities)
  if (blockers.length) throw new Error(blockers.join('\n'))

  const roster = Object.fromEntries(story.characters.map(character => {
    const seat = state.setup.seats.find(item => item.roleId === character.id)!
    const controller: Controller = seat.allowAiFallback
      ? {
          kind: 'ai',
          displayName: `AI · ${character.name}`,
          physicalProxy: state.setup.hostName.trim(),
        }
      : seat.humanName.trim()
      ? {
          kind: 'human',
          displayName: seat.humanName.trim(),
        }
      : {
          kind: 'unassigned',
          displayName: 'Unassigned',
        }
    return [character.id, controller]
  }))

  return {
    schemaVersion: 3,
    definitionFingerprint: state.definitionFingerprint,
    storyId: state.storyId,
    seed: state.seed,
    phase: 'prepared',
    id: state.id,
    createdAt: state.createdAt,
    preparedAt: now.toISOString(),
    hostName: state.setup.hostName.trim(),
    roster,
  }
}

export function startGame(definition: GameDefinition, state: PreparedGameState, now = new Date()): ActiveGameState {
  return {
    ...state,
    phase: 'active',
    playPhase: definition.acts[0].id,
    paused: false,
    completedBeatIds: [],
    revealedEvidenceIds: [],
    tokenBalances: Object.fromEntries(definition.story.characters.map(character => [character.id, SOCIAL_RULES.startingTokens])),
    ownedClueIds: Object.fromEntries(definition.story.characters.map(character => [character.id, []])),
    clueDecks: Object.fromEntries(definition.clueDecks.map(deck => [deck.id, {
      remainingClueIds: shuffleIds(deck.clues.map(clue => clue.id), `${definition.story.seed}:${deck.id}:clues`),
      drawnClueIds: [],
    }])),
    cluePrice: SOCIAL_RULES.initialCluePrice,
    duplicateClues: false,
    completedObjectiveIds: Object.fromEntries(definition.story.characters.map(character => [character.id, []])),
    hearing: null,
    hearingHistory: [],
    outcome: null,
    awards: {},
    aiPerformances: {},
    startedAt: now.toISOString(),
  }
}

function shuffleIds(ids: string[], seed: string) {
  const result = [...ids]
  let value = hashString(seed) || 1
  function random() {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function assertActive(state: ActiveGameState) {
  if (state.paused) throw new Error('The game is paused.')
}

function essentialBeats(definition: GameDefinition, phase: RunBeat['phase']) {
  return definition.story.runPlan.filter(beat => beat.phase === phase && beat.essential)
}

export function confirmRunBeat(definition: GameDefinition, state: ActiveGameState, beatId: string): ActiveGameState {
  const { story } = definition
  assertActive(state)
  const beat = story.runPlan.find(item => item.id === beatId)
  if (!beat) throw new Error(`Unknown run-plan beat ${beatId}.`)
  if (beat.phase !== state.playPhase) throw new Error(`${beat.title} belongs to ${beat.phase}, not ${state.playPhase}.`)
  const missingDependencies = beat.dependsOn.filter(id => !state.completedBeatIds.includes(id))
  if (missingDependencies.length) throw new Error(`${beat.title} is blocked by ${missingDependencies.join(', ')}.`)
  const missingAiPerformances = beat.actionIds.filter(actionId => {
    const owner = story.characters.find(character => character.actions.some(action => action.id === actionId))
    return owner && state.roster[owner.id]?.kind === 'ai' && !state.aiPerformances[actionId]
  })
  if (missingAiPerformances.length) throw new Error(`${beat.title} is waiting for AI performance: ${missingAiPerformances.join(', ')}.`)
  if (state.completedBeatIds.includes(beat.id)) return state
  return { ...state, completedBeatIds: [...state.completedBeatIds, beat.id] }
}

export function recordAiPerformance(
  definition: GameDefinition,
  state: ActiveGameState,
  roleId: string,
  actionId: string,
  text: string,
  now = new Date(),
): ActiveGameState {
  assertActive(state)
  const { story } = definition
  const character = story.characters.find(item => item.id === roleId)
  const action = character?.actions.find(item => item.id === actionId)
  if (!character || !action) throw new Error('That AI role or action does not exist in this story.')
  if (state.roster[roleId]?.kind !== 'ai') throw new Error(`${character.name} is not controlled by AI in this game.`)
  if (action.phase !== state.playPhase) throw new Error(`${action.id} belongs to ${action.phase}, not ${state.playPhase}.`)
  if (!text.trim()) throw new Error('An AI performance cannot be empty.')
  return {
    ...state,
    aiPerformances: {
      ...state.aiPerformances,
      [actionId]: { roleId, actionId, text: text.trim(), generatedAt: now.toISOString() },
    },
  }
}

export function undoRunBeat(definition: GameDefinition, state: ActiveGameState, beatId: string): ActiveGameState {
  assertActive(state)
  const { story } = definition
  const dependants = story.runPlan.filter(beat => beat.dependsOn.includes(beatId) && state.completedBeatIds.includes(beat.id))
  if (dependants.length) throw new Error(`Cannot undo while ${dependants.map(beat => beat.title).join(', ')} depends on it.`)
  return { ...state, completedBeatIds: state.completedBeatIds.filter(id => id !== beatId) }
}

export function advanceAct(definition: GameDefinition, state: ActiveGameState): ActiveGameState {
  assertActive(state)
  const actIndex = definition.acts.findIndex(act => act.id === state.playPhase)
  if (actIndex < 0) throw new Error(`${state.playPhase} is not an authored act.`)
  const current = definition.acts[actIndex]
  const missing = essentialBeats(definition, current.id).filter(beat => !state.completedBeatIds.includes(beat.id))
  if (missing.length) throw new Error(`${current.title} is missing: ${missing.map(beat => beat.title).join(', ')}.`)
  const next = definition.acts[actIndex + 1]
  return next
    ? { ...state, playPhase: next.id }
    : { ...state, playPhase: 'investigation', revealedEvidenceIds: definition.story.publicEvidence.map(item => item.id) }
}

export function toggleEvidence(state: ActiveGameState, evidenceId: string): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('Evidence can be tracked only during investigation.')
  const exists = state.revealedEvidenceIds.includes(evidenceId)
  return { ...state, revealedEvidenceIds: exists ? state.revealedEvidenceIds.filter(id => id !== evidenceId) : [...state.revealedEvidenceIds, evidenceId] }
}

function assertInvestigation(state: ActiveGameState) {
  assertActive(state)
  if (state.playPhase !== 'investigation' || state.outcome) throw new Error('That social action is available only during the open investigation.')
}

function assertRole(state: ActiveGameState, roleId: string) {
  if (!state.roster[roleId]) throw new Error(`No player exists for role ${roleId}.`)
}

export function transferTokens(state: ActiveGameState, fromRoleId: string, toRoleId: string, amount: number): ActiveGameState {
  assertInvestigation(state)
  assertRole(state, fromRoleId)
  assertRole(state, toRoleId)
  if (fromRoleId === toRoleId) throw new Error('Tokens must move between two different players.')
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Token transfers require a positive whole number.')
  if (state.tokenBalances[fromRoleId] < amount) throw new Error(`${fromRoleId} does not have ${amount} tokens.`)
  return {
    ...state,
    tokenBalances: {
      ...state.tokenBalances,
      [fromRoleId]: state.tokenBalances[fromRoleId] - amount,
      [toRoleId]: state.tokenBalances[toRoleId] + amount,
    },
  }
}

export function buyClue(definition: GameDefinition, state: ActiveGameState, roleId: string, deckId: string): ActiveGameState {
  assertInvestigation(state)
  assertRole(state, roleId)
  if (state.hearing) throw new Error('Clue buying pauses during an accusation hearing.')
  const definitionDeck = definition.clueDecks.find(deck => deck.id === deckId)
  const deck = state.clueDecks[deckId]
  if (!definitionDeck || !deck) throw new Error(`Unknown clue deck ${deckId}.`)
  if (state.tokenBalances[roleId] < state.cluePrice) throw new Error(`${roleId} cannot afford a ${state.cluePrice}-token clue.`)

  let clueId = deck.remainingClueIds[0]
  let remainingClueIds = deck.remainingClueIds.slice(1)
  if (!clueId) {
    if (!state.duplicateClues) throw new Error(`${definitionDeck.label} has no clues left.`)
    const originalOrder = deck.drawnClueIds.slice(0, definitionDeck.clues.length)
    clueId = originalOrder[(deck.drawnClueIds.length - definitionDeck.clues.length) % originalOrder.length]
    remainingClueIds = []
  }
  return {
    ...state,
    tokenBalances: { ...state.tokenBalances, [roleId]: state.tokenBalances[roleId] - state.cluePrice },
    ownedClueIds: { ...state.ownedClueIds, [roleId]: [...state.ownedClueIds[roleId], clueId] },
    clueDecks: {
      ...state.clueDecks,
      [deckId]: { remainingClueIds, drawnClueIds: [...deck.drawnClueIds, clueId] },
    },
  }
}

export function lowerCluePrice(state: ActiveGameState, nextPrice: number): ActiveGameState {
  assertInvestigation(state)
  if (!Number.isInteger(nextPrice) || nextPrice < 0 || nextPrice > state.cluePrice) throw new Error('The host may only lower the clue price to a non-negative whole number.')
  return { ...state, cluePrice: nextPrice }
}

export function enableDuplicateClues(state: ActiveGameState): ActiveGameState {
  assertInvestigation(state)
  return { ...state, duplicateClues: true }
}

export function callAccusation(state: ActiveGameState, accuserRoleId: string, accusedRoleId: string, caseText: string): ActiveGameState {
  assertInvestigation(state)
  assertRole(state, accuserRoleId)
  assertRole(state, accusedRoleId)
  if (state.hearing) throw new Error('Finish the current accusation hearing before starting another.')
  if (accuserRoleId === accusedRoleId) throw new Error('An accuser cannot accuse themselves.')
  if (!caseText.trim()) throw new Error('An accusation requires a case.')
  return {
    ...state,
    hearing: {
      id: `hearing-${state.hearingHistory.length + 1}`,
      accuserRoleId,
      accusedRoleId,
      caseText: caseText.trim(),
      stage: 'case',
      votes: {},
    },
  }
}

export function advanceHearing(state: ActiveGameState): ActiveGameState {
  assertInvestigation(state)
  if (!state.hearing) throw new Error('There is no accusation hearing to advance.')
  const stages = ['case', 'defense', 'statements', 'voting'] as const
  const index = stages.indexOf(state.hearing.stage)
  if (index === stages.length - 1) throw new Error('The hearing is already accepting votes.')
  return { ...state, hearing: { ...state.hearing, stage: stages[index + 1] } }
}

export function castVote(definition: GameDefinition, state: ActiveGameState, roleId: string, vote: AccusationVote): ActiveGameState {
  assertInvestigation(state)
  assertRole(state, roleId)
  if (!state.hearing || state.hearing.stage !== 'voting') throw new Error('Votes can be cast only during the voting stage.')
  if (state.hearing.votes[roleId]) throw new Error(`${roleId} has already voted in this hearing.`)
  const hearing = { ...state.hearing, votes: { ...state.hearing.votes, [roleId]: vote } }
  if (Object.keys(hearing.votes).length < definition.story.characters.length) return { ...state, hearing }

  const convictVotes = Object.values(hearing.votes).filter(value => value === 'convict').length
  const result = convictVotes >= getConvictionThreshold(definition) ? 'convicted' as const : 'failed' as const
  const resolved = { ...hearing, result, convictVotes }
  if (result === 'failed') return { ...state, hearing: null, hearingHistory: [...state.hearingHistory, resolved] }
  return {
    ...state,
    playPhase: 'reveal',
    hearing: null,
    hearingHistory: [...state.hearingHistory, resolved],
    outcome: { kind: 'conviction', accusedRoleId: hearing.accusedRoleId, hearingId: hearing.id },
  }
}

export function endInvestigation(state: ActiveGameState): ActiveGameState {
  assertInvestigation(state)
  if (state.hearing) throw new Error('Finish the active hearing before ending on time.')
  return { ...state, playPhase: 'reveal', outcome: { kind: 'time_expired' } }
}

export function revealToTable(_definition: GameDefinition, state: ActiveGameState): ActiveGameState {
  return endInvestigation(state)
}

export function setObjectiveCompleted(definition: GameDefinition, state: ActiveGameState, roleId: string, objectiveId: string, completed: boolean): ActiveGameState {
  assertActive(state)
  if (!['investigation', 'reveal'].includes(state.playPhase)) throw new Error('Objectives are scored only after the staged incident.')
  const character = definition.story.characters.find(item => item.id === roleId)
  if (!character?.objectives.some(objective => objective.id === objectiveId)) throw new Error(`Unknown objective ${objectiveId} for ${roleId}.`)
  const current = state.completedObjectiveIds[roleId] ?? []
  return {
    ...state,
    completedObjectiveIds: {
      ...state.completedObjectiveIds,
      [roleId]: completed ? [...new Set([...current, objectiveId])] : current.filter(id => id !== objectiveId),
    },
  }
}

export function recordAward(definition: GameDefinition, state: ActiveGameState, award: 'performance' | 'costume', roleId: string): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'reveal') throw new Error('Table awards are recorded during the reveal.')
  if (!definition.story.characters.some(character => character.id === roleId)) throw new Error(`Unknown award recipient ${roleId}.`)
  return { ...state, awards: { ...state.awards, [award === 'performance' ? 'performanceRoleId' : 'costumeRoleId']: roleId } }
}

export function calculateScores(definition: GameDefinition, state: ActiveGameState): Record<string, ScoreCard> {
  const culprit = definition.story.characters.find(character => character.name === definition.story.culprit)!
  const hearingId = state.outcome?.kind === 'conviction' ? state.outcome.hearingId : undefined
  const conviction = hearingId
    ? state.hearingHistory.find(hearing => hearing.id === hearingId)
    : undefined
  return Object.fromEntries(definition.story.characters.map(character => {
    const completed = new Set(state.completedObjectiveIds[character.id] ?? [])
    const objectivePoints = character.objectives.filter(objective => completed.has(objective.id)).reduce((sum, objective) => sum + objective.points, 0)
    const tokenPoints = Math.floor(state.tokenBalances[character.id] / SOCIAL_RULES.tokenPointDivisor)
    const correctConviction = conviction?.accusedRoleId === culprit.id
    const accuserPoints = correctConviction && conviction?.accuserRoleId === character.id ? SOCIAL_RULES.correctAccuserPoints : 0
    const votePoints = correctConviction && conviction?.votes[character.id] === 'convict' ? SOCIAL_RULES.correctVotePoints : 0
    const culpritEscapePoints = character.id === culprit.id && Boolean(conviction) && conviction?.accusedRoleId !== culprit.id ? SOCIAL_RULES.culpritEscapePoints : 0
    const score = { roleId: character.id, objectivePoints, tokenPoints, accuserPoints, votePoints, culpritEscapePoints, total: objectivePoints + tokenPoints + accuserPoints + votePoints + culpritEscapePoints }
    return [character.id, score]
  }))
}

export function getRevealBlockers(_definition: GameDefinition, state: ActiveGameState): string[] {
  if (state.playPhase === 'reveal' && state.outcome) return []
  return ['Investigation must end through a majority conviction or the time limit.']
}

export function completeGame(definition: GameDefinition, state: ActiveGameState, now = new Date()) {
  assertActive(state)
  if (state.playPhase !== 'reveal') throw new Error('The game can complete only after the table reveal.')
  if (!state.outcome) throw new Error('The game cannot complete without an investigation outcome.')
  return { ...state, phase: 'completed' as const, paused: false as const, completedAt: now.toISOString(), finalScores: calculateScores(definition, state) }
}

export function togglePause(state: ActiveGameState): ActiveGameState {
  return { ...state, paused: !state.paused }
}

export function abortGame(state: ExistingGameState, now = new Date()) {
  if (state.phase === 'completed') throw new Error('A completed game cannot be aborted.')
  if (state.phase === 'aborted') return state
  return {
    schemaVersion: 3 as const,
    definitionFingerprint: state.definitionFingerprint,
    storyId: state.storyId,
    seed: state.seed,
    phase: 'aborted' as const,
    id: state.id,
    createdAt: state.createdAt,
    hostName: state.phase === 'enrolling' ? state.setup.hostName.trim() : state.hostName,
    abortedAt: now.toISOString(),
    previousPhase: state.phase,
  }
}

export function resetGame(definition: GameDefinition, state: GameState, confirmed: boolean): IdleGameState {
  if (state.phase === 'idle') throw new Error('There is no game to reset.')
  if (!confirmed) throw new Error('Reset requires explicit confirmation.')
  return createIdleState(definition)
}
