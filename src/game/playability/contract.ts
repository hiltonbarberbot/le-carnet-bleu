import type { GameCommandName } from '../application/commands'
import type { GameLifecyclePhase, PlayPhase } from '../types'

export type PlayabilityCheckpoint =
  | 'create_session'
  | 'enrol_players'
  | 'prepare_game'
  | 'start_game'
  | 'opening'
  | 'investigation'
  | 'evidence'
  | 'economy'
  | 'clues'
  | 'objectives'
  | 'timeout_resolution'
  | 'failed_accusation'
  | 'conviction'
  | 'awards'
  | 'completion'

export type PlayabilityTraceEntry = {
  checkpoint: PlayabilityCheckpoint
  command?: GameCommandName
  phase: GameLifecyclePhase
  playPhase?: PlayPhase
  detail: string
}

export type PlayabilityCoverage = {
  openingStepIds: string[]
  evidenceIds: string[]
  clueIds: string[]
  objectiveIds: string[]
  resolutionKinds: Array<'time_expired' | 'conviction'>
}

export type PlayabilityFailure = {
  checkpoint: PlayabilityCheckpoint
  command?: GameCommandName
  message: string
}

export type StorylinePlayabilityReport = {
  schemaVersion: 1
  definitionFingerprint: string
  verdict: 'pass' | 'fail'
  summary: string
  trace: PlayabilityTraceEntry[]
  coverage: PlayabilityCoverage
  failure: PlayabilityFailure | null
}

export function formatPlayabilityFailure(report: StorylinePlayabilityReport): string {
  if (!report.failure) return report.summary
  const command = report.failure.command ? ` (${report.failure.command})` : ''
  return `Storyline playability failed at ${report.failure.checkpoint}${command}: ${report.failure.message}`
}
