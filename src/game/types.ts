import type { SettingReference } from './definition/contract'

export type OpeningPhase = 'opening'
export type PlayPhase = OpeningPhase | 'investigation' | 'reveal'
export type GameLifecyclePhase = 'idle' | 'enrolling' | 'prepared' | 'active' | 'completed' | 'aborted'

export type CharacterSecret = {
  id: string
  text: string
  kind: 'evidence' | 'secret' | 'colour'
  aboutRoleIds?: string[]
  provenance?: EvidenceProvenance
}

export type EvidenceProvenance = {
  source: { kind: 'role'; roleId: string } | { kind: 'public'; openingStepId: string } | { kind: 'setting'; settingRef: SettingReference }
  independenceGroup: string
}

export type OpeningExecution =
  | { kind: 'spoken' }
  | { kind: 'physical'; contact: 'none'; reversible: true; hostCued: true; proxy: 'player' | 'host' }

export type CharacterObjective = {
  id: string
  title: string
  text: string
  phase: 'investigation' | 'any'
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
  /** Legacy field accepted when importing older stories; new stories use scored objectives only. */
  privateObjective?: string
  privateSecret: string
  traits: string[]
  objectives: CharacterObjective[]
  relationships: CharacterRelationship[]
  secrets: CharacterSecret[]
}

export type PublicEvidence = {
  id: string
  text: string
  provenance?: EvidenceProvenance
}

export type SolutionStep = {
  id: string
  title: string
  truth: string
  evidence: string[]
}

export type CaseTheory = {
  motiveStepId: string
  meansStepId: string
  opportunityStepId: string
  actStepId: string
  coverUpStepId?: string
}

export type OpeningInstruction = {
  recipientRoleId: string
  text: string
}

export type OpeningStep = {
  id: string
  title: string
  trigger: string
  instructions: OpeningInstruction[]
  execution: OpeningExecution
  setupRequirementIds: string[]
  settingRefs: SettingReference[]
  propIds: string[]
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
  host: { id: string; name: string; title: string }
  victimRoleId: string
  culpritRoleId: string
  characters: Character[]
  publicEvidence: PublicEvidence[]
  evening: EveningStage[]
  solutionSteps: SolutionStep[]
  caseTheory?: CaseTheory
  openingSteps: OpeningStep[]
  solutionSummary: string
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

type StateIdentity = {
  schemaVersion: 5
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
  completedStepIds: string[]
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
