import { createStorylineDefinition } from '../../definition/create'
import type { StorylineDefinition } from '../../definition/contract'
import {
  formatPlayabilityFailure,
  simulateStorylinePlaythrough,
  type StorylinePlayabilityReport,
} from '../../playability'
import {
  formatLogicReviewFailure,
  logicReviewPassed,
  validateStoryLogicReview,
  type StoryLogicReview,
} from './contract'
import { auditStorylineLogicStatically } from './static'
import {
  formatStorylineRehearsalFailure,
  storylineRehearsalPassed,
  validateStorylineRehearsalReport,
  type StorylineRehearsalReport,
} from '../rehearsal'

export type StorylineReadinessVerdict = {
  schemaVersion: 2
  definitionFingerprint: string
  evaluatedAt: string
  status: 'playable' | 'blocked'
  deterministicReview: {
    status: 'passed' | 'failed'
    findings: string[]
    playthrough: StorylinePlayabilityReport | null
  }
  independentReview:
    | {
      status: 'passed' | 'rejected'
      kind: 'independent_llm'
      model: string
      review: StoryLogicReview
    }
    | {
      status: 'failed'
      kind: 'independent_llm'
      model: string
      failure: {
        code: 'reviewer_failed' | 'invalid_review'
        message: string
      }
    }
    | {
      status: 'not_run'
      kind: 'independent_llm'
      model: string
      reason: 'deterministic_validation_failed'
    }
  playabilityRehearsal:
    | {
      status: 'passed' | 'rejected'
      kind: 'spoiler_isolated_llm'
      roleModel: string
      hostModel: string
      judgeModel: string
      report: StorylineRehearsalReport
    }
    | {
      status: 'failed'
      kind: 'spoiler_isolated_llm'
      roleModel: string
      hostModel: string
      judgeModel: string
      failure: {
        code: 'rehearsal_failed' | 'invalid_rehearsal'
        message: string
      }
    }
    | {
      status: 'not_run'
      kind: 'spoiler_isolated_llm'
      roleModel: string
      hostModel: string
      judgeModel: string
      reason: 'deterministic_validation_failed' | 'independent_review_failed'
    }
  blockingReasons: string[]
}

export type StorylineReadinessEvaluation = {
  verdict: StorylineReadinessVerdict
  /** Runtime-only diagnostic. It is deliberately excluded from the durable verdict. */
  reviewerError?: unknown
  /** Runtime-only diagnostic. It is deliberately excluded from the durable verdict. */
  rehearsalError?: unknown
}

export type StorylineReadinessGateOptions = {
  model: string
  review: (definition: StorylineDefinition) => Promise<StoryLogicReview>
  rehearsal: {
    roleModel: string
    hostModel: string
    judgeModel: string
    run: (definition: StorylineDefinition) => Promise<StorylineRehearsalReport>
  }
  now?: () => Date
}

function failureMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The independent logic reviewer did not complete.'
}

export function inspectStorylineDeterministically(definition: StorylineDefinition) {
  const findings: string[] = []
  try {
    createStorylineDefinition(definition)
  } catch (error) {
    findings.push(failureMessage(error))
    return { findings, playthrough: null }
  }
  findings.push(...auditStorylineLogicStatically(definition))
  const playthrough = simulateStorylinePlaythrough(definition)
  if (playthrough.verdict === 'fail') findings.push(formatPlayabilityFailure(playthrough))
  return { findings: [...new Set(findings)], playthrough }
}

/**
 * Produces a serializable, fingerprint-bound playability verdict.
 *
 * The gate is intentionally fail-closed: deterministic failure prevents the
 * paid review call, while rejected, malformed, or unavailable LLM reviews all
 * produce a blocked verdict.
 */
export async function evaluateStorylineReadiness(
  definition: StorylineDefinition,
  options: StorylineReadinessGateOptions,
): Promise<StorylineReadinessEvaluation> {
  const evaluatedAt = (options.now ?? (() => new Date()))().toISOString()
  const { findings, playthrough } = inspectStorylineDeterministically(definition)

  if (findings.length) {
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'failed', findings, playthrough },
        independentReview: {
          status: 'not_run',
          kind: 'independent_llm',
          model: options.model,
          reason: 'deterministic_validation_failed',
        },
        playabilityRehearsal: {
          status: 'not_run',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          reason: 'deterministic_validation_failed',
        },
        blockingReasons: findings,
      },
    }
  }

  let review: StoryLogicReview
  try {
    review = await options.review(definition)
  } catch (reviewerError) {
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: {
          status: 'failed',
          kind: 'independent_llm',
          model: options.model,
          failure: { code: 'reviewer_failed', message: 'The independent logic review could not be completed.' },
        },
        playabilityRehearsal: {
          status: 'not_run',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          reason: 'independent_review_failed',
        },
        blockingReasons: ['The independent logic review could not be completed.'],
      },
      reviewerError,
    }
  }

  const reviewErrors = validateStoryLogicReview(definition, review)
  if (reviewErrors.length) {
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: {
          status: 'failed',
          kind: 'independent_llm',
          model: options.model,
          failure: { code: 'invalid_review', message: 'The independent logic review returned an invalid verdict.' },
        },
        playabilityRehearsal: {
          status: 'not_run',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          reason: 'independent_review_failed',
        },
        blockingReasons: reviewErrors,
      },
    }
  }

  if (!logicReviewPassed(review)) {
    const reason = formatLogicReviewFailure(review)
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: { status: 'rejected', kind: 'independent_llm', model: options.model, review },
        playabilityRehearsal: {
          status: 'not_run',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          reason: 'independent_review_failed',
        },
        blockingReasons: [reason],
      },
    }
  }

  let rehearsal: StorylineRehearsalReport
  try {
    rehearsal = await options.rehearsal.run(definition)
  } catch (rehearsalError) {
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: { status: 'passed', kind: 'independent_llm', model: options.model, review },
        playabilityRehearsal: {
          status: 'failed',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          failure: { code: 'rehearsal_failed', message: 'The spoiler-isolated play rehearsal could not be completed.' },
        },
        blockingReasons: ['The spoiler-isolated play rehearsal could not be completed.'],
      },
      rehearsalError,
    }
  }

  const rehearsalErrors = validateStorylineRehearsalReport(definition, rehearsal)
  if (rehearsalErrors.length
    || rehearsal.roleModel !== options.rehearsal.roleModel
    || rehearsal.hostModel !== options.rehearsal.hostModel
    || rehearsal.judgeModel !== options.rehearsal.judgeModel) {
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: { status: 'passed', kind: 'independent_llm', model: options.model, review },
        playabilityRehearsal: {
          status: 'failed',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          failure: { code: 'invalid_rehearsal', message: 'The spoiler-isolated play rehearsal returned an invalid report.' },
        },
        blockingReasons: rehearsalErrors.length
          ? rehearsalErrors
          : ['The spoiler-isolated play rehearsal used an unexpected model identity.'],
      },
    }
  }

  if (!storylineRehearsalPassed(rehearsal)) {
    const reason = formatStorylineRehearsalFailure(rehearsal)
    return {
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt,
        status: 'blocked',
        deterministicReview: { status: 'passed', findings: [], playthrough },
        independentReview: { status: 'passed', kind: 'independent_llm', model: options.model, review },
        playabilityRehearsal: {
          status: 'rejected',
          kind: 'spoiler_isolated_llm',
          roleModel: options.rehearsal.roleModel,
          hostModel: options.rehearsal.hostModel,
          judgeModel: options.rehearsal.judgeModel,
          report: rehearsal,
        },
        blockingReasons: [reason],
      },
    }
  }

  return {
    verdict: {
      schemaVersion: 2,
      definitionFingerprint: definition.fingerprint,
      evaluatedAt,
      status: 'playable',
      deterministicReview: { status: 'passed', findings: [], playthrough },
      independentReview: { status: 'passed', kind: 'independent_llm', model: options.model, review },
      playabilityRehearsal: {
        status: 'passed',
        kind: 'spoiler_isolated_llm',
        roleModel: options.rehearsal.roleModel,
        hostModel: options.rehearsal.hostModel,
        judgeModel: options.rehearsal.judgeModel,
        report: rehearsal,
      },
      blockingReasons: [],
    },
  }
}

export type PlayableStorylineReadinessVerdict = StorylineReadinessVerdict & {
  status: 'playable'
  deterministicReview: StorylineReadinessVerdict['deterministicReview'] & { status: 'passed' }
  independentReview: {
    status: 'passed'
    kind: 'independent_llm'
    model: string
    review: StoryLogicReview
  }
  playabilityRehearsal: {
    status: 'passed'
    kind: 'spoiler_isolated_llm'
    roleModel: string
    hostModel: string
    judgeModel: string
    report: StorylineRehearsalReport
  }
}

export function storylineReadinessPassed(
  verdict: StorylineReadinessVerdict,
): verdict is PlayableStorylineReadinessVerdict {
  return verdict.status === 'playable'
    && verdict.deterministicReview.status === 'passed'
    && verdict.deterministicReview.findings.length === 0
    && verdict.deterministicReview.playthrough?.verdict === 'pass'
    && verdict.deterministicReview.playthrough.definitionFingerprint === verdict.definitionFingerprint
    && verdict.independentReview.status === 'passed'
    && verdict.independentReview.review.definitionFingerprint === verdict.definitionFingerprint
    && logicReviewPassed(verdict.independentReview.review)
    && verdict.playabilityRehearsal.status === 'passed'
    && verdict.playabilityRehearsal.report.definitionFingerprint === verdict.definitionFingerprint
    && verdict.playabilityRehearsal.report.roleModel === verdict.playabilityRehearsal.roleModel
    && verdict.playabilityRehearsal.report.hostModel === verdict.playabilityRehearsal.hostModel
    && verdict.playabilityRehearsal.report.judgeModel === verdict.playabilityRehearsal.judgeModel
    && storylineRehearsalPassed(verdict.playabilityRehearsal.report)
    && verdict.blockingReasons.length === 0
}

export function validateStorylineReadinessVerdict(
  definition: StorylineDefinition,
  value: unknown,
): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['readiness verdict is not an object']
  const verdict = value as Record<string, unknown>
  const errors: string[] = []
  if (verdict.schemaVersion !== 2) errors.push('readiness verdict has an unsupported schema version')
  if (verdict.definitionFingerprint !== definition.fingerprint) errors.push('readiness verdict fingerprint does not match the storyline')
  if (typeof verdict.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(verdict.evaluatedAt))) errors.push('readiness verdict has an invalid evaluation time')
  if (!['playable', 'blocked'].includes(String(verdict.status))) errors.push('readiness verdict has an invalid status')

  const deterministic = verdict.deterministicReview && typeof verdict.deterministicReview === 'object' && !Array.isArray(verdict.deterministicReview)
    ? verdict.deterministicReview as Record<string, unknown>
    : undefined
  if (!deterministic || !['passed', 'failed'].includes(String(deterministic.status))) {
    errors.push('readiness verdict has no valid deterministic review')
  }
  if (!deterministic || !Array.isArray(deterministic.findings) || deterministic.findings.some(item => typeof item !== 'string' || !item.trim())) {
    errors.push('readiness deterministic findings are invalid')
  }
  const playthrough = deterministic?.playthrough && typeof deterministic.playthrough === 'object' && !Array.isArray(deterministic.playthrough)
    ? deterministic.playthrough as Record<string, unknown>
    : undefined
  if (deterministic?.status === 'passed' && (!playthrough || playthrough.verdict !== 'pass' || playthrough.definitionFingerprint !== definition.fingerprint)) {
    errors.push('readiness deterministic review passed without a matching successful playthrough')
  }

  const independent = verdict.independentReview && typeof verdict.independentReview === 'object' && !Array.isArray(verdict.independentReview)
    ? verdict.independentReview as Record<string, unknown>
    : undefined
  if (!independent || independent.kind !== 'independent_llm' || typeof independent.model !== 'string' || !independent.model.trim()) {
    errors.push('readiness verdict has no valid independent reviewer identity')
  }
  if (!independent || !['passed', 'rejected', 'failed', 'not_run'].includes(String(independent.status))) {
    errors.push('readiness verdict has no valid independent review status')
  }
  if (independent?.status === 'passed' || independent?.status === 'rejected') {
    errors.push(...validateStoryLogicReview(definition, independent.review))
  } else if (independent?.status === 'failed') {
    const failure = independent.failure && typeof independent.failure === 'object' && !Array.isArray(independent.failure)
      ? independent.failure as Record<string, unknown>
      : undefined
    if (!failure || !['reviewer_failed', 'invalid_review'].includes(String(failure.code)) || typeof failure.message !== 'string' || !failure.message.trim()) {
      errors.push('readiness independent review failure is invalid')
    }
  } else if (independent?.status === 'not_run' && independent.reason !== 'deterministic_validation_failed') {
    errors.push('readiness independent review has an invalid not-run reason')
  }

  const rehearsal = verdict.playabilityRehearsal && typeof verdict.playabilityRehearsal === 'object' && !Array.isArray(verdict.playabilityRehearsal)
    ? verdict.playabilityRehearsal as Record<string, unknown>
    : undefined
  if (!rehearsal
    || rehearsal.kind !== 'spoiler_isolated_llm'
    || typeof rehearsal.roleModel !== 'string'
    || !rehearsal.roleModel.trim()
    || typeof rehearsal.hostModel !== 'string'
    || !rehearsal.hostModel.trim()
    || typeof rehearsal.judgeModel !== 'string'
    || !rehearsal.judgeModel.trim()) {
    errors.push('readiness verdict has no valid playability rehearsal identity')
  }
  if (!rehearsal || !['passed', 'rejected', 'failed', 'not_run'].includes(String(rehearsal.status))) {
    errors.push('readiness verdict has no valid playability rehearsal status')
  }
  if (rehearsal?.status === 'passed' || rehearsal?.status === 'rejected') {
    const reportErrors = validateStorylineRehearsalReport(definition, rehearsal.report)
    errors.push(...reportErrors)
    const report = rehearsal.report && typeof rehearsal.report === 'object' && !Array.isArray(rehearsal.report)
      ? rehearsal.report as Record<string, unknown>
      : undefined
    if (report?.roleModel !== rehearsal.roleModel || report?.hostModel !== rehearsal.hostModel || report?.judgeModel !== rehearsal.judgeModel) {
      errors.push('readiness playability rehearsal model identity does not match its report')
    }
    if (reportErrors.length === 0) {
      const passed = storylineRehearsalPassed(rehearsal.report as StorylineRehearsalReport)
      if (rehearsal.status === 'passed' && !passed) errors.push('readiness playability rehearsal passed with a rejected report')
      if (rehearsal.status === 'rejected' && passed) errors.push('readiness playability rehearsal rejected a passing report')
    }
  } else if (rehearsal?.status === 'failed') {
    const failure = rehearsal.failure && typeof rehearsal.failure === 'object' && !Array.isArray(rehearsal.failure)
      ? rehearsal.failure as Record<string, unknown>
      : undefined
    if (!failure
      || !['rehearsal_failed', 'invalid_rehearsal'].includes(String(failure.code))
      || typeof failure.message !== 'string'
      || !failure.message.trim()) errors.push('readiness playability rehearsal failure is invalid')
  } else if (rehearsal?.status === 'not_run'
    && !['deterministic_validation_failed', 'independent_review_failed'].includes(String(rehearsal.reason))) {
    errors.push('readiness playability rehearsal has an invalid not-run reason')
  }
  if ((rehearsal?.status === 'passed' || rehearsal?.status === 'rejected') && independent?.status !== 'passed') {
    errors.push('readiness playability rehearsal ran before the independent review passed')
  }
  if (rehearsal?.status === 'not_run' && rehearsal.reason === 'deterministic_validation_failed' && deterministic?.status !== 'failed') {
    errors.push('readiness playability rehearsal incorrectly skipped for deterministic validation')
  }
  if (rehearsal?.status === 'not_run' && rehearsal.reason === 'independent_review_failed' && independent?.status === 'passed') {
    errors.push('readiness playability rehearsal incorrectly skipped for independent review')
  }

  if (!Array.isArray(verdict.blockingReasons) || verdict.blockingReasons.some(item => typeof item !== 'string' || !item.trim())) {
    errors.push('readiness blocking reasons are invalid')
  }
  const validReview = independent?.status === 'passed'
    && validateStoryLogicReview(definition, independent.review).length === 0
    && logicReviewPassed(independent.review as StoryLogicReview)
  const validRehearsal = rehearsal?.status === 'passed'
    && validateStorylineRehearsalReport(definition, rehearsal.report).length === 0
    && storylineRehearsalPassed(rehearsal.report as StorylineRehearsalReport)
    && (rehearsal.report as StorylineRehearsalReport).roleModel === rehearsal.roleModel
    && (rehearsal.report as StorylineRehearsalReport).hostModel === rehearsal.hostModel
    && (rehearsal.report as StorylineRehearsalReport).judgeModel === rehearsal.judgeModel
  const passes = deterministic?.status === 'passed'
    && Array.isArray(deterministic.findings)
    && deterministic.findings.length === 0
    && playthrough?.verdict === 'pass'
    && playthrough.definitionFingerprint === definition.fingerprint
    && validReview
    && validRehearsal
    && Array.isArray(verdict.blockingReasons)
    && verdict.blockingReasons.length === 0
  if (verdict.status === 'playable' && !passes) errors.push('readiness verdict cannot be playable unless every required review passed')
  if (verdict.status === 'blocked' && passes) errors.push('readiness verdict cannot be blocked when every required review passed')
  return [...new Set(errors)]
}

export function formatStorylineReadinessFailure(verdict: StorylineReadinessVerdict): string {
  return ['Storyline is not playable.', ...verdict.blockingReasons].join('\n')
}
