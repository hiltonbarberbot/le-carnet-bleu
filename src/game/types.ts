export type GamePhase = 'lobby' | 'dinner' | 'blackout' | 'investigation' | 'reveal' | 'complete' | 'aborted'
export type RunPhase = Extract<GamePhase, 'dinner' | 'blackout'>

export type Memory = {
  id: string
  text: string
  kind: 'evidence' | 'secret' | 'colour'
  beat?: number
}

export type Action = {
  id: string
  text: string
  cue: string
  consequence: string
  essential: boolean
  beat?: number
  phase: RunPhase
  physical: boolean
}

export type Character = {
  id: string
  name: string
  title: string
  costume: string
  publicFace: string
  privateSecret: string
  memories: Memory[]
  actions: Action[]
}

export type PublicEvidence = {
  id: string
  text: string
  beat: number
}

export type TimelineBeat = {
  beat: number
  title: string
  truth: string
  evidence: string[]
}

export type RunBeat = {
  id: string
  phase: RunPhase
  title: string
  trigger: string
  operator: string
  actionIds: string[]
  dependsOn: string[]
  essential: boolean
}

export type Story = {
  id: string
  seed: string
  title: string
  subtitle: string
  totalPeople: number
  hostRole: string
  victim: string
  culprit: string
  characters: Character[]
  publicEvidence: PublicEvidence[]
  timeline: TimelineBeat[]
  runPlan: RunBeat[]
  solution: string
}

export type Controller =
  | { kind: 'human'; displayName: string }
  | { kind: 'ai'; displayName: string; physicalProxy: string }

export type SeatDraft = {
  roleId: string
  humanName: string
  ready: boolean
  allowAiFallback: boolean
}

export type VenueCheck = {
  id: string
  label: string
}

export type SetupDraft = {
  hostName: string
  seats: SeatDraft[]
  venue: Record<string, boolean>
}

export type Accusation = {
  culprit: string
  motive: string
  chain: string
}

export type GameSession = {
  id: string
  storyId: string
  seed: string
  phase: GamePhase
  paused: boolean
  hostName: string
  roster: Record<string, Controller>
  completedBeatIds: string[]
  revealedEvidenceIds: string[]
  accusation: Accusation
  startedAt: string
  completedAt?: string
}
