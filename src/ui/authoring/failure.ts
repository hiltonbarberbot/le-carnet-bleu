import { AiRequestError, type AiProblemCode } from '../../game/ai/problem'
import type { CertificationBlockingReason } from '../../game/story/certification/feedback'

export type DraftingStage = 'setting' | 'story'

export type DraftFailure = {
  title: string
  message: string
  help: string
  stage: DraftingStage
  retryable: boolean
  reference?: string
  blockingReasons?: CertificationBlockingReason[]
  attemptCount?: number
}

const titles: Partial<Record<AiProblemCode, string>> = {
  not_configured: 'Drafting needs to be connected',
  access_denied: 'The AI connection needs attention',
  quota_exhausted: 'The AI allowance has run out',
  model_unavailable: 'The selected AI model is unavailable',
  rate_limited: 'The AI service is busy',
  timed_out: 'The draft took too long',
  provider_unavailable: 'The AI service is having trouble',
  connection_failed: 'Couldn’t reach the drafting service',
  bad_response: 'The drafting service sent a broken response',
}

const help: Partial<Record<AiProblemCode, string>> = {
  invalid_request: 'Edit the seed and try again.',
  not_configured: 'The deployment owner needs to connect the AI Gateway before drafts can be made.',
  access_denied: 'The deployment owner needs to check the AI Gateway credentials.',
  quota_exhausted: 'The deployment owner needs to restore the AI usage allowance.',
  model_unavailable: 'The deployment owner needs to choose an available model.',
  rate_limited: 'Wait a moment, then try again. Your seed is still here.',
  timed_out: 'Try again. Your seed is still here and nothing was saved.',
  provider_unavailable: 'Try again in a moment. Your seed is still here.',
  connection_failed: 'Check your connection, then try again. Your seed is still here.',
  bad_response: 'Try again. If it repeats, share the reference below with the deployment owner.',
  unknown: 'Try again. If it repeats, share the reference below with the deployment owner.',
}

export function describeDraftFailure(error: unknown, stage: DraftingStage): DraftFailure {
  const problem = error instanceof AiRequestError ? error : undefined
  const code = problem?.code ?? 'unknown'

  if (code === 'invalid_output') {
    return {
      title: stage === 'setting' ? 'The setting didn’t pass our checks' : 'The story didn’t pass our checks',
      message: stage === 'setting'
        ? 'The AI filled in the brief, but some setting or safety details were not usable.'
        : 'The AI returned a draft, but it was not yet fair and playable enough to use.',
      help: stage === 'setting'
        ? 'Try again, or add the real venue and two areas where play can happen.'
        : 'Try again. Your seed is still here and the rejected draft was not saved.',
      stage,
      retryable: true,
      reference: problem?.reference,
      ...(problem?.details ? {
        blockingReasons: problem.details.blockingReasons,
        attemptCount: problem.details.attemptCount,
      } : {}),
    }
  }

  return {
    title: titles[code] ?? (stage === 'setting' ? 'Couldn’t prepare the setting' : 'Couldn’t write the story'),
    message: problem?.message ?? 'The drafting service failed unexpectedly.',
    help: help[code] ?? help.unknown!,
    stage,
    retryable: problem?.retryable ?? true,
    reference: problem?.reference,
    ...(problem?.details ? {
      blockingReasons: problem.details.blockingReasons,
      attemptCount: problem.details.attemptCount,
    } : {}),
  }
}
