export type AiProblemCode =
  | 'invalid_request'
  | 'not_configured'
  | 'access_denied'
  | 'quota_exhausted'
  | 'model_unavailable'
  | 'rate_limited'
  | 'timed_out'
  | 'provider_unavailable'
  | 'invalid_output'
  | 'connection_failed'
  | 'bad_response'
  | 'unknown'

export type AiProblemPayload = {
  error: string
  code: AiProblemCode
  retryable: boolean
  reference?: string
}

function isProblemCode(value: unknown): value is AiProblemCode {
  return typeof value === 'string' && [
    'invalid_request',
    'not_configured',
    'access_denied',
    'quota_exhausted',
    'model_unavailable',
    'rate_limited',
    'timed_out',
    'provider_unavailable',
    'invalid_output',
    'connection_failed',
    'bad_response',
    'unknown',
  ].includes(value)
}

function readProblem(value: unknown): AiProblemPayload | undefined {
  if (!value || typeof value !== 'object') return
  const candidate = value as Record<string, unknown>
  if (typeof candidate.error !== 'string' || !isProblemCode(candidate.code) || typeof candidate.retryable !== 'boolean') return
  return {
    error: candidate.error,
    code: candidate.code,
    retryable: candidate.retryable,
    reference: typeof candidate.reference === 'string' ? candidate.reference : undefined,
  }
}

function fallbackCode(status: number): AiProblemCode {
  if (status === 408 || status === 504) return 'timed_out'
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'access_denied'
  if (status === 503) return 'provider_unavailable'
  if (status >= 400 && status < 500) return 'invalid_request'
  return 'unknown'
}

export class AiRequestError extends Error {
  readonly code: AiProblemCode
  readonly retryable: boolean
  readonly reference?: string
  readonly status?: number

  constructor(problem: AiProblemPayload, status?: number) {
    super(problem.error)
    this.name = 'AiRequestError'
    this.code = problem.code
    this.retryable = problem.retryable
    this.reference = problem.reference
    this.status = status
  }
}

export async function requestAiJson<T>(input: RequestInfo | URL, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    throw new AiRequestError({
      error: timedOut
        ? 'The drafting request took too long and was stopped.'
        : 'The drafting service could not be reached. Check your connection and try again.',
      code: timedOut ? 'timed_out' : 'connection_failed',
      retryable: true,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    const code = fallbackCode(response.status)
    throw new AiRequestError({
      error: response.ok
        ? 'The drafting service returned an unreadable response.'
        : 'The drafting service failed before it could explain what went wrong.',
      code: response.ok ? 'bad_response' : code,
      retryable: code === 'timed_out' || code === 'rate_limited' || code === 'provider_unavailable' || code === 'unknown',
      reference: response.headers.get('x-vercel-id') ?? undefined,
    }, response.status)
  }

  if (!response.ok) {
    const problem = readProblem(payload)
    if (problem) throw new AiRequestError(problem, response.status)
    const code = fallbackCode(response.status)
    const legacyMessage = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `The drafting service failed (${response.status}).`
    throw new AiRequestError({
      error: legacyMessage,
      code,
      retryable: code === 'timed_out' || code === 'rate_limited' || code === 'provider_unavailable' || code === 'unknown',
      reference: response.headers.get('x-vercel-id') ?? undefined,
    }, response.status)
  }

  return payload as T
}
