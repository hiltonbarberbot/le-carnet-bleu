import type {
  Accusation,
  ActiveGameState,
  Controller,
  DeliveryRecord,
  EnrollingGameState,
  ExistingGameState,
  GameState,
  IdleGameState,
  PreparedGameState,
  RunBeat,
  RuntimeCapabilities,
  SeatDraft,
  SetupDraft,
} from '../types'
import type { GameDefinition } from '../definition/contract'

export const browserCapabilities: RuntimeCapabilities = {
  aiControllers: false,
}

export function createSetupDraft(definition: GameDefinition): SetupDraft {
  const { story } = definition
  return {
    hostName: '',
    seats: story.characters.map<SeatDraft>(character => ({
      roleId: character.id,
      participantId: '',
      humanName: '',
      privateAddress: '',
      ready: false,
      allowAiFallback: false,
    })),
    venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, false])),
  }
}

export function createIdleState(definition: GameDefinition): IdleGameState {
  return { schemaVersion: 2, definitionFingerprint: definition.fingerprint, storyId: definition.story.id, seed: definition.story.seed, phase: 'idle' }
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

  const participantIds = new Set<string>()
  const addresses = new Set<string>()
  for (const character of story.characters) {
    const seat = setup.seats.find(item => item.roleId === character.id)
    if (!seat) {
      blockers.push(`${character.name} has no seat configuration.`)
      continue
    }

    if (seat.humanName.trim()) {
      if (!seat.participantId.trim()) blockers.push(`${seat.humanName.trim()} has no stable participant identity.`)
      if (!seat.privateAddress.trim()) blockers.push(`${seat.humanName.trim()} has no private delivery address.`)
      if (!seat.ready) blockers.push(`${seat.humanName.trim()} has not confirmed readiness for ${character.name}.`)
      if (seat.participantId.trim() && participantIds.has(seat.participantId.trim())) blockers.push(`${seat.humanName.trim()} duplicates another participant identity.`)
      if (seat.privateAddress.trim() && addresses.has(seat.privateAddress.trim())) blockers.push(`${seat.humanName.trim()} duplicates another private delivery address.`)
      participantIds.add(seat.participantId.trim())
      addresses.add(seat.privateAddress.trim())
      continue
    }

    if (!seat.allowAiFallback) {
      blockers.push(`${character.name} has no ready human and no fallback permission.`)
    } else if (!capabilities.aiControllers) {
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
    const controller: Controller = seat.humanName.trim()
      ? {
          kind: 'human',
          participantId: seat.participantId.trim(),
          displayName: seat.humanName.trim(),
          privateAddress: seat.privateAddress.trim(),
        }
      : {
          kind: 'ai',
          displayName: `AI · ${character.name}`,
          physicalProxy: state.setup.hostName.trim(),
        }
    return [character.id, controller]
  }))

  const deliveries = Object.fromEntries(story.characters.map(character => {
    const controller = roster[character.id]
    const delivery: DeliveryRecord = controller.kind === 'human'
      ? { roleId: character.id, address: controller.privateAddress, status: 'not_requested', attempts: 0 }
      : { roleId: character.id, status: 'not_required', attempts: 0 }
    return [character.id, delivery]
  }))

  return {
    schemaVersion: 2,
    definitionFingerprint: state.definitionFingerprint,
    storyId: state.storyId,
    seed: state.seed,
    phase: 'prepared',
    id: state.id,
    createdAt: state.createdAt,
    preparedAt: now.toISOString(),
    hostName: state.setup.hostName.trim(),
    roster,
    deliveries,
  }
}

function updateDelivery(state: PreparedGameState, roleId: string, record: DeliveryRecord): PreparedGameState {
  if (!state.deliveries[roleId]) throw new Error(`No delivery exists for role ${roleId}.`)
  return { ...state, deliveries: { ...state.deliveries, [roleId]: record } }
}

export function requestDelivery(state: PreparedGameState, roleId: string, now = new Date()): PreparedGameState {
  const delivery = state.deliveries[roleId]
  if (!delivery) throw new Error(`No delivery exists for role ${roleId}.`)
  if (delivery.status !== 'not_requested' && delivery.status !== 'failed') {
    throw new Error(`Delivery for ${roleId} cannot be queued from ${delivery.status}.`)
  }
  return updateDelivery(state, roleId, {
    roleId,
    address: delivery.address,
    status: 'queued',
    attempts: delivery.attempts + 1,
    requestedAt: now.toISOString(),
  })
}

export function beginDelivery(state: PreparedGameState, roleId: string, now = new Date()): PreparedGameState {
  const delivery = state.deliveries[roleId]
  if (!delivery || delivery.status !== 'queued') throw new Error(`Delivery for ${roleId} can begin only from queued.`)
  return updateDelivery(state, roleId, { ...delivery, status: 'sending', sendingAt: now.toISOString() })
}

export type DeliveryOutcome =
  | { ok: true; receipt: string }
  | { ok: false; error: string }

export function recordDeliveryOutcome(
  state: PreparedGameState,
  roleId: string,
  outcome: DeliveryOutcome,
  now = new Date(),
): PreparedGameState {
  const delivery = state.deliveries[roleId]
  if (!delivery || delivery.status !== 'sending') throw new Error(`Delivery for ${roleId} can finish only from sending.`)
  if (outcome.ok && !outcome.receipt.trim()) throw new Error('A confirmed delivery requires a non-empty receipt.')
  if (!outcome.ok && !outcome.error.trim()) throw new Error('A failed delivery requires an error.')
  return updateDelivery(state, roleId, outcome.ok
    ? { ...delivery, status: 'delivered', deliveredAt: now.toISOString(), receipt: outcome.receipt.trim() }
    : { ...delivery, status: 'failed', failedAt: now.toISOString(), error: outcome.error.trim() })
}

export function getStartBlockers(definition: GameDefinition, state: PreparedGameState): string[] {
  const { story } = definition
  return story.characters.flatMap(character => {
    const delivery = state.deliveries[character.id]
    return delivery?.status === 'delivered' || delivery?.status === 'not_required'
      ? []
      : [`${character.name} dossier is ${delivery?.status ?? 'missing'}.`]
  })
}

export function startGame(definition: GameDefinition, state: PreparedGameState, now = new Date()): ActiveGameState {
  const blockers = getStartBlockers(definition, state)
  if (blockers.length) throw new Error(blockers.join('\n'))
  return {
    ...state,
    phase: 'active',
    playPhase: definition.acts[0].id,
    paused: false,
    completedBeatIds: [],
    revealedEvidenceIds: [],
    accusations: Object.fromEntries(definition.story.characters.map(character => [character.id, { culprit: '', motive: '', chain: '' }])),
    aiPerformances: {},
    startedAt: now.toISOString(),
  }
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

export function updateAccusation(state: ActiveGameState, roleId: string, accusation: Accusation): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('The accusation can be edited only during investigation.')
  if (!state.roster[roleId]) throw new Error(`No player exists for role ${roleId}.`)
  return { ...state, accusations: { ...state.accusations, [roleId]: accusation } }
}

export function getRevealBlockers(definition: GameDefinition, state: ActiveGameState): string[] {
  const { story } = definition
  const blockers: string[] = []
  for (const character of story.characters) {
    const ballot = state.accusations[character.id]
    if (!ballot?.culprit.trim()) blockers.push(`${character.name} has not named a culprit.`)
    if (!ballot?.motive.trim()) blockers.push(`${character.name} has not given a motive.`)
    if (!ballot?.chain.trim()) blockers.push(`${character.name} has not named their strongest clue.`)
  }
  return blockers
}

export function revealToTable(definition: GameDefinition, state: ActiveGameState): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('The table reveal can start only after investigation.')
  const blockers = getRevealBlockers(definition, state)
  if (blockers.length) throw new Error(blockers.join('\n'))
  return { ...state, playPhase: 'reveal' }
}

export function completeGame(state: ActiveGameState, now = new Date()) {
  assertActive(state)
  if (state.playPhase !== 'reveal') throw new Error('The game can complete only after the table reveal.')
  return { ...state, phase: 'completed' as const, paused: false as const, completedAt: now.toISOString() }
}

export function togglePause(state: ActiveGameState): ActiveGameState {
  return { ...state, paused: !state.paused }
}

export function abortGame(state: ExistingGameState, now = new Date()) {
  if (state.phase === 'completed') throw new Error('A completed game cannot be aborted.')
  if (state.phase === 'aborted') return state
  return {
    schemaVersion: 2 as const,
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
