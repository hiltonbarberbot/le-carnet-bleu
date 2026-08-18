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
  Story,
  VenueCheck,
} from '../types'

export const venueChecks: VenueCheck[] = [
  { id: 'notebook', label: 'A blue notebook is hidden in Pierre’s blue jacket before guests arrive.' },
  { id: 'jackets', label: 'Pierre and Jacques have distinct labelled jackets that can be removed and switched.' },
  { id: 'route', label: 'A safe terrace-or-hall route connects the dinner table to the staged study.' },
  { id: 'lights', label: 'The host can safely control a sixty-second blackout.' },
  { id: 'study', label: 'The study has a desk and enough clear space to mime the fall without contact.' },
  { id: 'briefing', label: 'The host has privately rehearsed the blackout sequence with Jacques, Madame, and Pierre.' },
]

export const browserCapabilities: RuntimeCapabilities = {
  aiControllers: false,
}

export function createSetupDraft(story: Story): SetupDraft {
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
    venue: Object.fromEntries(venueChecks.map(check => [check.id, false])),
  }
}

export function createIdleState(story: Story): IdleGameState {
  return { schemaVersion: 1, storyId: story.id, seed: story.seed, phase: 'idle' }
}

export function createGame(story: Story, now = new Date(), id: string = crypto.randomUUID()): EnrollingGameState {
  return {
    ...createIdleState(story),
    phase: 'enrolling',
    id,
    createdAt: now.toISOString(),
    setup: createSetupDraft(story),
  }
}

export function updateEnrolment(state: EnrollingGameState, setup: SetupDraft): EnrollingGameState {
  return { ...state, setup }
}

export function getSetupBlockers(story: Story, setup: SetupDraft, capabilities: RuntimeCapabilities): string[] {
  const blockers: string[] = []
  if (!setup.hostName.trim()) blockers.push('The host/Concierge has not been named.')

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

  for (const check of venueChecks) {
    if (!setup.venue[check.id]) blockers.push(`Venue requirement missing: ${check.label}`)
  }

  return blockers
}

export function prepareGame(
  story: Story,
  state: EnrollingGameState,
  capabilities: RuntimeCapabilities,
  now = new Date(),
): PreparedGameState {
  const blockers = getSetupBlockers(story, state.setup, capabilities)
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
    schemaVersion: 1,
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

export function getStartBlockers(story: Story, state: PreparedGameState): string[] {
  return story.characters.flatMap(character => {
    const delivery = state.deliveries[character.id]
    return delivery?.status === 'delivered' || delivery?.status === 'not_required'
      ? []
      : [`${character.name} dossier is ${delivery?.status ?? 'missing'}.`]
  })
}

export function startGame(story: Story, state: PreparedGameState, now = new Date()): ActiveGameState {
  const blockers = getStartBlockers(story, state)
  if (blockers.length) throw new Error(blockers.join('\n'))
  return {
    ...state,
    phase: 'active',
    playPhase: 'dinner',
    paused: false,
    completedBeatIds: [],
    revealedEvidenceIds: [],
    accusation: { culprit: '', motive: '', chain: '' },
    aiPerformances: {},
    startedAt: now.toISOString(),
  }
}

function assertActive(state: ActiveGameState) {
  if (state.paused) throw new Error('The game is paused.')
}

function essentialBeats(story: Story, phase: RunBeat['phase']) {
  return story.runPlan.filter(beat => beat.phase === phase && beat.essential)
}

export function confirmRunBeat(story: Story, state: ActiveGameState, beatId: string): ActiveGameState {
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
  story: Story,
  state: ActiveGameState,
  roleId: string,
  actionId: string,
  text: string,
  now = new Date(),
): ActiveGameState {
  assertActive(state)
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

export function undoRunBeat(story: Story, state: ActiveGameState, beatId: string): ActiveGameState {
  assertActive(state)
  const dependants = story.runPlan.filter(beat => beat.dependsOn.includes(beatId) && state.completedBeatIds.includes(beat.id))
  if (dependants.length) throw new Error(`Cannot undo while ${dependants.map(beat => beat.title).join(', ')} depends on it.`)
  return { ...state, completedBeatIds: state.completedBeatIds.filter(id => id !== beatId) }
}

export function startBlackout(story: Story, state: ActiveGameState): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'dinner') throw new Error('The blackout can start only during dinner.')
  const missing = essentialBeats(story, 'dinner').filter(beat => !state.completedBeatIds.includes(beat.id))
  if (missing.length) throw new Error(`Dinner is missing: ${missing.map(beat => beat.title).join(', ')}.`)
  return { ...state, playPhase: 'blackout' }
}

export function startInvestigation(story: Story, state: ActiveGameState): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'blackout') throw new Error('Investigation can start only after the blackout.')
  const missing = essentialBeats(story, 'blackout').filter(beat => !state.completedBeatIds.includes(beat.id))
  if (missing.length) throw new Error(`The murder scene is incomplete: ${missing.map(beat => beat.title).join(', ')}.`)
  return { ...state, playPhase: 'investigation', revealedEvidenceIds: story.publicEvidence.map(item => item.id) }
}

export function toggleEvidence(state: ActiveGameState, evidenceId: string): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('Evidence can be tracked only during investigation.')
  const exists = state.revealedEvidenceIds.includes(evidenceId)
  return { ...state, revealedEvidenceIds: exists ? state.revealedEvidenceIds.filter(id => id !== evidenceId) : [...state.revealedEvidenceIds, evidenceId] }
}

export function updateAccusation(state: ActiveGameState, accusation: Accusation): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('The accusation can be edited only during investigation.')
  return { ...state, accusation }
}

export function getRevealBlockers(story: Story, state: ActiveGameState): string[] {
  const blockers: string[] = []
  if (!state.accusation.culprit.trim()) blockers.push('The group has not named a culprit.')
  if (!state.accusation.motive.trim()) blockers.push('The group has not stated a motive.')
  if (!state.accusation.chain.trim()) blockers.push('The group has not explained the action chain.')
  for (const beat of story.timeline) {
    if (!beat.evidence.some(id => state.revealedEvidenceIds.includes(id))) blockers.push(`No evidence from beat ${beat.beat}, “${beat.title}”, has entered the investigation.`)
  }
  return blockers
}

export function revealToTable(story: Story, state: ActiveGameState): ActiveGameState {
  assertActive(state)
  if (state.playPhase !== 'investigation') throw new Error('The table reveal can start only after investigation.')
  const blockers = getRevealBlockers(story, state)
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
    schemaVersion: 1 as const,
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

export function resetGame(story: Story, state: GameState, confirmed: boolean): IdleGameState {
  if (state.phase === 'idle') throw new Error('There is no game to reset.')
  if (!confirmed) throw new Error('Reset requires explicit confirmation.')
  return createIdleState(story)
}
