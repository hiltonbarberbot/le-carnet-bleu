import type {
  Accusation,
  GameSession,
  RunBeat,
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

export const runtimeCapabilities = {
  aiControllers: false,
}

export function createSetupDraft(story: Story): SetupDraft {
  return {
    hostName: '',
    seats: story.characters.map<SeatDraft>(character => ({
      roleId: character.id,
      humanName: '',
      ready: false,
      allowAiFallback: false,
    })),
    venue: Object.fromEntries(venueChecks.map(check => [check.id, false])),
  }
}

export function getSetupBlockers(story: Story, setup: SetupDraft): string[] {
  const blockers: string[] = []
  if (!setup.hostName.trim()) blockers.push('The host/Concierge has not been named.')

  for (const character of story.characters) {
    const seat = setup.seats.find(item => item.roleId === character.id)
    if (!seat) {
      blockers.push(`${character.name} has no seat configuration.`)
      continue
    }

    if (seat.humanName.trim() && seat.ready) continue

    if (seat.allowAiFallback) {
      if (!runtimeCapabilities.aiControllers) {
        blockers.push(`${character.name} would require AI fallback, but this build has no AI controller runtime.`)
      }
      continue
    }

    if (seat.humanName.trim()) blockers.push(`${seat.humanName.trim()} has not confirmed readiness for ${character.name}.`)
    else blockers.push(`${character.name} has no ready human and no usable fallback.`)
  }

  for (const check of venueChecks) {
    if (!setup.venue[check.id]) blockers.push(`Venue requirement missing: ${check.label}`)
  }

  return blockers
}

export function lockRoster(story: Story, setup: SetupDraft, now = new Date()): GameSession {
  const blockers = getSetupBlockers(story, setup)
  if (blockers.length) throw new Error(blockers.join('\n'))

  const roster = Object.fromEntries(story.characters.map(character => {
    const seat = setup.seats.find(item => item.roleId === character.id)!
    if (seat.humanName.trim() && seat.ready) {
      return [character.id, { kind: 'human' as const, displayName: seat.humanName.trim() }]
    }

    return [character.id, {
      kind: 'ai' as const,
      displayName: `AI · ${character.name}`,
      physicalProxy: setup.hostName.trim(),
    }]
  }))

  return {
    id: crypto.randomUUID(),
    storyId: story.id,
    seed: story.seed,
    phase: 'lobby',
    paused: false,
    hostName: setup.hostName.trim(),
    roster,
    completedBeatIds: [],
    revealedEvidenceIds: [],
    accusation: { culprit: '', motive: '', chain: '' },
    startedAt: now.toISOString(),
  }
}

function assertActive(session: GameSession) {
  if (session.paused) throw new Error('The game is paused.')
  if (session.phase === 'aborted' || session.phase === 'complete') throw new Error(`The game is ${session.phase}.`)
}

function essentialBeats(story: Story, phase: RunBeat['phase']) {
  return story.runPlan.filter(beat => beat.phase === phase && beat.essential)
}

export function startDinner(session: GameSession): GameSession {
  assertActive(session)
  if (session.phase !== 'lobby') throw new Error('Dinner can start only from the lobby.')
  return { ...session, phase: 'dinner' }
}

export function confirmRunBeat(story: Story, session: GameSession, beatId: string): GameSession {
  assertActive(session)
  const beat = story.runPlan.find(item => item.id === beatId)
  if (!beat) throw new Error(`Unknown run-plan beat ${beatId}.`)
  if (beat.phase !== session.phase) throw new Error(`${beat.title} belongs to ${beat.phase}, not ${session.phase}.`)
  const missingDependencies = beat.dependsOn.filter(id => !session.completedBeatIds.includes(id))
  if (missingDependencies.length) throw new Error(`${beat.title} is blocked by ${missingDependencies.join(', ')}.`)
  if (session.completedBeatIds.includes(beat.id)) return session
  return { ...session, completedBeatIds: [...session.completedBeatIds, beat.id] }
}

export function undoRunBeat(story: Story, session: GameSession, beatId: string): GameSession {
  assertActive(session)
  const dependants = story.runPlan.filter(beat => beat.dependsOn.includes(beatId) && session.completedBeatIds.includes(beat.id))
  if (dependants.length) throw new Error(`Cannot undo while ${dependants.map(beat => beat.title).join(', ')} depends on it.`)
  return { ...session, completedBeatIds: session.completedBeatIds.filter(id => id !== beatId) }
}

export function startBlackout(story: Story, session: GameSession): GameSession {
  assertActive(session)
  if (session.phase !== 'dinner') throw new Error('The blackout can start only during dinner.')
  const missing = essentialBeats(story, 'dinner').filter(beat => !session.completedBeatIds.includes(beat.id))
  if (missing.length) throw new Error(`Dinner is missing: ${missing.map(beat => beat.title).join(', ')}.`)
  return { ...session, phase: 'blackout' }
}

export function startInvestigation(story: Story, session: GameSession): GameSession {
  assertActive(session)
  if (session.phase !== 'blackout') throw new Error('Investigation can start only after the blackout.')
  const missing = essentialBeats(story, 'blackout').filter(beat => !session.completedBeatIds.includes(beat.id))
  if (missing.length) throw new Error(`The murder scene is incomplete: ${missing.map(beat => beat.title).join(', ')}.`)
  return {
    ...session,
    phase: 'investigation',
    revealedEvidenceIds: story.publicEvidence.map(item => item.id),
  }
}

export function toggleEvidence(session: GameSession, evidenceId: string): GameSession {
  assertActive(session)
  if (session.phase !== 'investigation') throw new Error('Evidence can be tracked only during investigation.')
  const exists = session.revealedEvidenceIds.includes(evidenceId)
  return {
    ...session,
    revealedEvidenceIds: exists
      ? session.revealedEvidenceIds.filter(id => id !== evidenceId)
      : [...session.revealedEvidenceIds, evidenceId],
  }
}

export function updateAccusation(session: GameSession, accusation: Accusation): GameSession {
  assertActive(session)
  if (session.phase !== 'investigation') throw new Error('The accusation can be edited only during investigation.')
  return { ...session, accusation }
}

export function getRevealBlockers(story: Story, session: GameSession): string[] {
  const blockers: string[] = []
  if (!session.accusation.culprit.trim()) blockers.push('The group has not named a culprit.')
  if (!session.accusation.motive.trim()) blockers.push('The group has not stated a motive.')
  if (!session.accusation.chain.trim()) blockers.push('The group has not explained the action chain.')
  for (const beat of story.timeline) {
    if (!beat.evidence.some(id => session.revealedEvidenceIds.includes(id))) {
      blockers.push(`No evidence from beat ${beat.beat}, “${beat.title}”, has entered the investigation.`)
    }
  }
  return blockers
}

export function revealToTable(story: Story, session: GameSession): GameSession {
  assertActive(session)
  if (session.phase !== 'investigation') throw new Error('The table reveal can start only after investigation.')
  const blockers = getRevealBlockers(story, session)
  if (blockers.length) throw new Error(blockers.join('\n'))
  return { ...session, phase: 'reveal' }
}

export function completeGame(session: GameSession, now = new Date()): GameSession {
  assertActive(session)
  if (session.phase !== 'reveal') throw new Error('The game can complete only after the table reveal.')
  return { ...session, phase: 'complete', completedAt: now.toISOString() }
}

export function togglePause(session: GameSession): GameSession {
  if (session.phase === 'aborted' || session.phase === 'complete') return session
  return { ...session, paused: !session.paused }
}

export function abortGame(session: GameSession): GameSession {
  if (session.phase === 'complete') throw new Error('A completed game cannot be aborted.')
  return { ...session, phase: 'aborted', paused: false }
}
