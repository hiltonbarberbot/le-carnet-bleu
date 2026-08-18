export type RunPhase = string
export type PlayPhase = RunPhase | 'investigation' | 'reveal'
export type GameLifecyclePhase = 'idle' | 'enrolling' | 'prepared' | 'active' | 'completed' | 'aborted'

export type Memory = {
  id: string
  text: string
  kind: 'evidence' | 'secret' | 'colour'
  beat?: number
  availableAfter?: string
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
  requires: string[]
}

export type CharacterGoal = {
  id: string
  title: string
  text: string
  phase: RunPhase | 'any'
  points: number
}

export type CharacterAbility = {
  id: string
  title: string
  text: string
  uses: 1 | 2
}

export type CharacterItem = {
  title: string
  text: string
}

export type CharacterRelationship = {
  roleId: string
  kind: 'approach' | 'watch'
  text: string
}

export type Character = {
  id: string
  name: string
  title: string
  costume: string
  publicFace: string
  invitationPretext: string
  invitationPromise: string
  privateIdentity: string
  privateObjective: string
  privateSecret: string
  goals: CharacterGoal[]
  abilities: CharacterAbility[]
  item: CharacterItem
  relationships: CharacterRelationship[]
  dilemma: string
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

export type EveningStage = {
  id: string
  title: string
  description: string
  durationMinutes: number
  phase: PlayPhase
}

export type Story = {
  id: string
  seed: string
  title: string
  subtitle: string
  premise: string
  totalPeople: number
  hostRole: string
  victim: string
  culprit: string
  characters: Character[]
  publicEvidence: PublicEvidence[]
  evening: EveningStage[]
  timeline: TimelineBeat[]
  runPlan: RunBeat[]
  solution: string
}

export type HumanController = {
  kind: 'human'
  participantId: string
  displayName: string
  privateAddress: string
}

export type AiController = {
  kind: 'ai'
  displayName: string
  physicalProxy: string
}

export type Controller = HumanController | AiController

export type SeatDraft = {
  roleId: string
  participantId: string
  humanName: string
  privateAddress: string
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

export type DeliveryStatus = 'not_required' | 'not_requested' | 'queued' | 'sending' | 'delivered' | 'failed'

export type DeliveryRecord = {
  roleId: string
  address?: string
  status: DeliveryStatus
  attempts: number
  requestedAt?: string
  sendingAt?: string
  deliveredAt?: string
  receipt?: string
  failedAt?: string
  error?: string
}

export type Accusation = {
  culprit: string
  motive: string
  chain: string
}

export type AccusationBallots = Record<string, Accusation>

export type AiPerformanceRecord = {
  roleId: string
  actionId: string
  text: string
  generatedAt: string
}

type StateIdentity = {
  schemaVersion: 2
  definitionFingerprint: string
  storyId: string
  seed: string
}

export type IdleGameState = StateIdentity & {
  phase: 'idle'
}

export type EnrollingGameState = StateIdentity & {
  phase: 'enrolling'
  id: string
  createdAt: string
  setup: SetupDraft
}

export type PreparedGameState = StateIdentity & {
  phase: 'prepared'
  id: string
  createdAt: string
  preparedAt: string
  hostName: string
  roster: Record<string, Controller>
  deliveries: Record<string, DeliveryRecord>
}

export type ActiveGameState = StateIdentity & {
  phase: 'active'
  id: string
  createdAt: string
  preparedAt: string
  startedAt: string
  hostName: string
  roster: Record<string, Controller>
  deliveries: Record<string, DeliveryRecord>
  playPhase: PlayPhase
  paused: boolean
  completedBeatIds: string[]
  revealedEvidenceIds: string[]
  accusations: AccusationBallots
  aiPerformances: Record<string, AiPerformanceRecord>
}

export type CompletedGameState = Omit<ActiveGameState, 'phase' | 'paused'> & {
  phase: 'completed'
  paused: false
  completedAt: string
}

export type AbortedGameState = StateIdentity & {
  phase: 'aborted'
  id: string
  createdAt: string
  hostName: string
  abortedAt: string
  previousPhase: Exclude<GameLifecyclePhase, 'idle' | 'aborted'>
}

export type ExistingGameState = EnrollingGameState | PreparedGameState | ActiveGameState | CompletedGameState | AbortedGameState
export type GameState = IdleGameState | ExistingGameState

export type RuntimeCapabilities = {
  aiControllers: boolean
}
