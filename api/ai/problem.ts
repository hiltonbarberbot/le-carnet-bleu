import type { AiProblemCode, AiProblemPayload } from '../../src/game/ai/problem.js'

type ProblemOptions = {
  message?: string
  reference?: string
  status?: number
}

const defaults: Record<AiProblemCode, { message: string; retryable: boolean; status: number }> = {
  invalid_request: { message: 'The drafting request was not valid.', retryable: false, status: 400 },
  not_configured: { message: 'AI drafting is not configured on this deployment.', retryable: false, status: 503 },
  access_denied: { message: 'The AI service rejected this deployment’s credentials.', retryable: false, status: 503 },
  quota_exhausted: { message: 'The AI service has no usage allowance left.', retryable: false, status: 503 },
  model_unavailable: { message: 'The configured AI model is not available.', retryable: false, status: 503 },
  rate_limited: { message: 'The AI service is handling too many requests right now.', retryable: true, status: 429 },
  timed_out: { message: 'The AI service took too long to answer.', retryable: true, status: 504 },
  provider_unavailable: { message: 'The AI service is temporarily unavailable.', retryable: true, status: 503 },
  invalid_output: { message: 'The AI returned a draft that did not pass the game checks.', retryable: true, status: 502 },
  connection_failed: { message: 'The AI service could not be reached.', retryable: true, status: 503 },
  bad_response: { message: 'The AI service returned an unreadable response.', retryable: true, status: 502 },
  unknown: { message: 'The drafting service failed unexpectedly.', retryable: true, status: 500 },
}

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  return error && typeof error === 'object' ? error as Record<string, unknown> : undefined
}

function deepestError(error: unknown) {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    const record = errorRecord(current)
    const nested = record?.lastError ?? record?.cause
    if (!nested || nested === current) break
    current = nested
  }
  return current
}

function readStatus(error: unknown) {
  for (const candidate of [deepestError(error), error]) {
    const status = errorRecord(candidate)?.statusCode
    if (typeof status === 'number') return status
  }
}

export function createProblemReference() {
  return crypto.randomUUID().slice(0, 8).toUpperCase()
}

export function classifyAiProviderError(error: unknown): AiProblemCode {
  if (error instanceof SyntaxError) return 'invalid_output'
  const deepest = deepestError(error)
  const names = [errorRecord(error)?.name, errorRecord(deepest)?.name]
  if (names.includes('AI_NoObjectGeneratedError')) return 'invalid_output'

  const status = readStatus(error)
  if (status === 401 || status === 403) return 'access_denied'
  if (status === 402) return 'quota_exhausted'
  if (status === 404) return 'model_unavailable'
  if (status === 408 || status === 504) return 'timed_out'
  if (status === 429) return 'rate_limited'
  if (status === 424 || (status !== undefined && status >= 500)) return 'provider_unavailable'

  const message = deepest instanceof Error ? deepest.message.toLowerCase() : ''
  if (message.includes('timeout') || message.includes('timed out')) return 'timed_out'
  if (message.includes('fetch failed') || message.includes('network')) return 'connection_failed'
  return 'unknown'
}

export function problemResponse(code: AiProblemCode, options: ProblemOptions = {}) {
  const fallback = defaults[code]
  const body: AiProblemPayload = {
    error: options.message ?? fallback.message,
    code,
    retryable: fallback.retryable,
    ...(options.reference ? { reference: options.reference } : {}),
  }
  return Response.json(body, {
    status: options.status ?? fallback.status,
    headers: { 'cache-control': 'no-store' },
  })
}
