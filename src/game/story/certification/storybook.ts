import type { SettingBrief } from '../../setting/contract'
import type { StorylineDefinition } from '../../definition/contract'
import { storylineReadinessPassed } from '../review/readiness'
import { logicReviewPassed } from '../review/contract'
import { classifyAiProviderError } from '../../ai/server/problem'
import type { LibraryScope } from '../../persistence/repository'
import {
  assembleReadinessStep,
  assembleRehearsalStep,
  certifyStorylineStep,
  draftStorylineStep,
  failCertificationStep,
  inspectStorylineStep,
  judgeRehearsalStep,
  markCertificationRunning,
  rehearseHostStep,
  rehearseRoleStep,
  rehearseTableStep,
  reviewStorylineStep,
  type CertificationModels,
} from './steps'
import {
  createAuthoringRepairBrief,
  createFailureDetails,
  createReadinessRepairBrief,
} from './feedback'

function providerFailure(error: unknown) {
  const code = classifyAiProviderError(error)
  const retryable = ['rate_limited', 'timed_out', 'provider_unavailable', 'connection_failed', 'bad_response', 'unknown'].includes(code)
  return {
    code,
    message: retryable
      ? 'The certification service could not finish after automatic retries.'
      : 'The certification service is not available with its current configuration.',
    retryable,
  }
}

export type StorylineCertificationInput = {
  jobId: string
  scope: LibraryScope
  source:
    | { kind: 'setting'; setting: SettingBrief }
    | { kind: 'storyline'; definition: StorylineDefinition }
  models: CertificationModels
}

export type StorylineCertificationResult =
  | { status: 'succeeded'; jobId: string; storylineFingerprint: string }
  | { status: 'failed'; jobId: string }

/** Durable author → review → isolated rehearsal → atomic certification. */
export async function certifyStorylineWorkflow(
  input: StorylineCertificationInput,
): Promise<StorylineCertificationResult> {
  'use workflow'

  await markCertificationRunning(input.scope, input.jobId)
  let repairBrief = createAuthoringRepairBrief('The generated story was invalid.')
  let attemptsRun = 0

  try {
    const attempts = input.source.kind === 'setting' ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      attemptsRun = attempt + 1
      const authored = input.source.kind === 'setting'
        ? await draftStorylineStep(input.source.setting, attempt, repairBrief)
        : { status: 'authored' as const, definition: input.source.definition }
      if (authored.status === 'rejected') {
        repairBrief = createAuthoringRepairBrief(
          authored.reason,
          authored.kind === 'malformed' ? 'malformed_output' : 'invalid_definition',
        )
        continue
      }

      const definition = authored.definition
      const deterministic = await inspectStorylineStep(definition)
      if (deterministic.findings.length) {
        const evaluation = await assembleReadinessStep(definition, input.models)
        repairBrief = createReadinessRepairBrief(evaluation.verdict)
        continue
      }

      const review = await reviewStorylineStep(definition, input.models.review)
      if (!logicReviewPassed(review)) {
        const evaluation = await assembleReadinessStep(definition, input.models, review)
        repairBrief = createReadinessRepairBrief(evaluation.verdict)
        continue
      }

      const [hostReport, roleReports, tableReport] = await Promise.all([
        rehearseHostStep(definition, input.models.hostRehearsal),
        Promise.all(definition.story.characters.map((_character, roleIndex) => (
          rehearseRoleStep(definition, roleIndex, input.models.roleRehearsal)
        ))),
        rehearseTableStep(definition, input.models.tableRehearsal),
      ])
      const judgeReview = await judgeRehearsalStep(
        definition,
        roleReports,
        hostReport,
        tableReport,
        input.models.rehearsalJudge,
      )
      const rehearsal = await assembleRehearsalStep(
        definition,
        input.models,
        roleReports,
        hostReport,
        tableReport,
        judgeReview,
      )
      const evaluation = await assembleReadinessStep(definition, input.models, review, rehearsal)
      if (!storylineReadinessPassed(evaluation.verdict)) {
        repairBrief = createReadinessRepairBrief(evaluation.verdict)
        continue
      }

      await certifyStorylineStep(input.scope, input.jobId, definition, evaluation)
      return { status: 'succeeded', jobId: input.jobId, storylineFingerprint: definition.fingerprint }
    }

    await failCertificationStep(input.scope, input.jobId, {
      code: 'invalid_output',
      message: input.source.kind === 'setting'
        ? 'The generated mystery did not pass the complete playability certification after automatic repair.'
        : 'The imported mystery did not pass the complete playability certification.',
      retryable: input.source.kind === 'setting',
      details: createFailureDetails(repairBrief, attemptsRun),
    })
    return { status: 'failed', jobId: input.jobId }
  } catch (error) {
    await failCertificationStep(input.scope, input.jobId, providerFailure(error))
    return { status: 'failed', jobId: input.jobId }
  }
}
