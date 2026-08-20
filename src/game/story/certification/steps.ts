import { FatalError, RetryableError } from 'workflow'
import {
  authorStorylineAttempt,
  type StorylineAuthoringAttempt,
} from '../../../../api/ai/author'
import type { StorylineDefinition } from '../../definition/contract'
import { certifyValidatedStoryline } from '../../persistence/library'
import type { LibraryScope } from '../../persistence/repository'
import { getGameLibraryRepository } from '../../persistence/postgres'
import type { SettingBrief } from '../../setting/contract'
import {
  evaluateStorylineReadiness,
  inspectStorylineDeterministically,
  type StorylineReadinessEvaluation,
} from '../review/readiness'
import type { StoryLogicReview } from '../review/contract'
import { reviewStorylineLogic } from '../review/gateway'
import type {
  HostRehearsalReport,
  RehearsalJudgeReview,
  RoleRehearsalReport,
  StorylineRehearsalReport,
} from '../rehearsal/contract'
import {
  judgeRehearsalWithGateway,
  rehearseHostWithGateway,
  rehearseRoleWithGateway,
} from '../rehearsal/gateway'
import { rehearseStoryline } from '../rehearsal/rehearse'
import type { CertificationJobFailure } from './jobs'
import { getCertificationJobRepository } from './postgres'

export type CertificationModels = {
  author: string
  review: string
  roleRehearsal: string
  hostRehearsal: string
  rehearsalJudge: string
}

export async function markCertificationRunning(scope: LibraryScope, jobId: string) {
  'use step'
  await getCertificationJobRepository().markRunning(scope, jobId)
}

export async function draftStorylineStep(
  setting: SettingBrief,
  attempt: number,
  priorFailure?: string,
): Promise<StorylineAuthoringAttempt> {
  'use step'
  const authored = await authorStorylineAttempt(setting, attempt, priorFailure)
  if (authored.status === 'rejected' && authored.kind === 'malformed') {
    throw new RetryableError(`The author model returned malformed output: ${authored.reason}`)
  }
  return authored
}
draftStorylineStep.maxRetries = 2

export async function inspectStorylineStep(definition: StorylineDefinition) {
  'use step'
  return inspectStorylineDeterministically(definition)
}

export async function reviewStorylineStep(definition: StorylineDefinition, model: string) {
  'use step'
  return reviewStorylineLogic(definition, { model })
}
reviewStorylineStep.maxRetries = 2

export async function rehearseRoleStep(definition: StorylineDefinition, roleIndex: number, model: string) {
  'use step'
  return rehearseRoleWithGateway(definition, roleIndex, { model })
}
rehearseRoleStep.maxRetries = 2

export async function rehearseHostStep(definition: StorylineDefinition, model: string) {
  'use step'
  return rehearseHostWithGateway(definition, { model })
}
rehearseHostStep.maxRetries = 2

export async function judgeRehearsalStep(
  definition: StorylineDefinition,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
  model: string,
) {
  'use step'
  return judgeRehearsalWithGateway(definition, roleReports, hostReport, { model })
}
judgeRehearsalStep.maxRetries = 2

export async function assembleRehearsalStep(
  definition: StorylineDefinition,
  models: CertificationModels,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
  judgeReview: RehearsalJudgeReview,
): Promise<StorylineRehearsalReport> {
  'use step'
  return rehearseStoryline(definition, {
    roleModel: models.roleRehearsal,
    hostModel: models.hostRehearsal,
    judgeModel: models.rehearsalJudge,
    rehearseRole: async (_candidate, roleIndex) => roleReports[roleIndex],
    rehearseHost: async () => hostReport,
    judge: async () => judgeReview,
  })
}

export async function assembleReadinessStep(
  definition: StorylineDefinition,
  models: CertificationModels,
  review?: StoryLogicReview,
  rehearsal?: StorylineRehearsalReport,
): Promise<StorylineReadinessEvaluation> {
  'use step'
  return evaluateStorylineReadiness(definition, {
    model: models.review,
    review: async () => {
      if (!review) throw new Error('The independent review was not supplied to the readiness assembler.')
      return review
    },
    rehearsal: {
      roleModel: models.roleRehearsal,
      hostModel: models.hostRehearsal,
      judgeModel: models.rehearsalJudge,
      run: async () => {
        if (!rehearsal) throw new Error('The rehearsal was not supplied to the readiness assembler.')
        return rehearsal
      },
    },
  })
}

export async function certifyStorylineStep(
  scope: LibraryScope,
  jobId: string,
  definition: StorylineDefinition,
  evaluation: StorylineReadinessEvaluation,
) {
  'use step'
  if (evaluation.verdict.status !== 'playable') throw new FatalError('A blocked storyline cannot be certified.')
  await certifyValidatedStoryline(
    getGameLibraryRepository(),
    scope,
    definition,
    evaluation.verdict,
  )
  await getCertificationJobRepository().markSucceeded(scope, jobId, definition.fingerprint)
}

export async function failCertificationStep(
  scope: LibraryScope,
  jobId: string,
  failure: CertificationJobFailure,
) {
  'use step'
  await getCertificationJobRepository().markFailed(scope, jobId, failure)
}
