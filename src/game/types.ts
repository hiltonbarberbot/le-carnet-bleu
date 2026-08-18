export type RunPhase = string
export type PlayPhase = RunPhase | 'investigation' | 'reveal'
export type GameLifecyclePhase = 'idle' | 'enrolling' | 'prepared' | 'active' | 'completed' | 'aborted'

export type CharacterSecret = {
  id: string
  text: string
  kind: 'evidence' | 'secret' | 'colour'
  aboutRoleIds?: string[]
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

export type CharacterObjective = {
  id: string
  title: string
  text: string
  phase: RunPhase | 'any'
  points: number
}

export type CharacterRelationship = {
  roleId: string
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
  traits: string[]
  objectives: CharacterObjective[]
  relationships: CharacterRelationship[]
  secrets: CharacterSecret[]
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
  displayName: string
}

export type AiController = {
  kind: 'ai'
  displayName: string
  physicalProxy: string
}

export type UnassignedController = {
  kind: 'unassigned'
  displayName: string
}

export type Controller = HumanController | AiController | UnassignedController

export type SeatDraft = {
  roleId: string
  humanName: string
  allowAiFallback?: boolean
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

export type ClueDeckState = {
  remainingClueIds: string[]
  drawnClueIds: string[]
}

export type AccusationVote = 'convict' | 'acquit'

export type AccusationHearingStage = 'case' | 'defense' | 'statements' | 'voting'

export type AccusationHearing = {
  id: string
  accuserRoleId: string
  accusedRoleId: string
  caseText: string
  stage: AccusationHearingStage
  votes: Record<string, AccusationVote>
}

export type AccusationHearingResult = AccusationHearing & {
  result: 'convicted' | 'failed'
  convictVotes: number
}

export type GameOutcome =
  | { kind: 'conviction'; accusedRoleId: string; hearingId: string }
  | { kind: 'time_expired' }

export type ScoreCard = {
  roleId: string
  objectivePoints: number
  tokenPoints: number
  accuserPoints: number
  votePoints: number
  culpritEscapePoints: number
  total: number
}

export type SocialAwards = {
  performanceRoleId?: string
  costumeRoleId?: string
}

export type AiPerformanceRecord = {
  roleId: string
  actionId: string
  text: string
  generatedAt: string
}

type StateIdentity = {
  schemaVersion: 3
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
}

export type ActiveGameState = StateIdentity & {
  phase: 'active'
  id: string
  createdAt: string
  preparedAt: string
  startedAt: string
  hostName: string
  roster: Record<string, Controller>
  playPhase: PlayPhase
  paused: boolean
  completedBeatIds: string[]
  revealedEvidenceIds: string[]
  tokenBalances: Record<string, number>
  ownedClueIds: Record<string, string[]>
  clueDecks: Record<string, ClueDeckState>
  cluePrice: number
  duplicateClues: boolean
  completedObjectiveIds: Record<string, string[]>
  hearing: AccusationHearing | null
  hearingHistory: AccusationHearingResult[]
  outcome: GameOutcome | null
  awards: SocialAwards
  aiPerformances: Record<string, AiPerformanceRecord>
}

export type CompletedGameState = Omit<ActiveGameState, 'phase' | 'paused'> & {
  phase: 'completed'
  paused: false
  completedAt: string
  finalScores: Record<string, ScoreCard>
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
