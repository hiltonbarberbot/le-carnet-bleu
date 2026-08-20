import { createStorylineDefinition } from '../definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../definition/contract'
import type { SettingBrief } from '../setting/contract'
import { AiRequestError, requestAiJson, type AiProblemCode } from './problem'
import type { CertificationFailureDetails } from '../story/certification/feedback'

export type StorylineCertificationStatus =
  | { jobId: string; status: 'pending' | 'running' }
  | { jobId: string; status: 'succeeded'; definition: StorylineDefinitionInput }
  | { jobId: string; status: 'failed'; error: string; code: AiProblemCode; retryable: boolean; details?: CertificationFailureDetails }

type CertificationRequestOptions = {
  signal?: AbortSignal
}

export async function startStorylineCertification(
  setting: SettingBrief,
  options: CertificationRequestOptions = {},
) {
  return requestAiJson<{ jobId: string; status: 'pending' }>('/api/ai/author', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setting }),
    signal: options.signal,
  })
}

export async function readStorylineCertification(
  jobId: string,
  options: CertificationRequestOptions = {},
) {
  return requestAiJson<StorylineCertificationStatus>(`/api/ai/author/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    signal: options.signal,
  })
}

function pause(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal?.reason ?? new DOMException('The certification poll was aborted.', 'AbortError'))
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function resumeStorylineCertification(
  jobId: string,
  options: { pollIntervalMs?: number; signal?: AbortSignal } = {},
): Promise<StorylineDefinition> {
  const pollIntervalMs = options.pollIntervalMs ?? 3000
  while (true) {
    options.signal?.throwIfAborted()
    let payload: StorylineCertificationStatus
    try {
      payload = await readStorylineCertification(jobId, { signal: options.signal })
    } catch (error) {
      // requestAiJson turns fetch aborts into a user-facing timeout. Restore the
      // abort here so unmounted pollers can exit silently.
      options.signal?.throwIfAborted()
      throw error
    }
    options.signal?.throwIfAborted()
    if (payload.status === 'failed') {
      throw new AiRequestError({
        error: payload.error,
        code: payload.code,
        retryable: payload.retryable,
        details: payload.details,
      })
    }
    if (payload.status === 'succeeded') {
      try {
        return createStorylineDefinition(payload.definition)
      } catch {
        throw new AiRequestError({
          error: 'The certified story did not pass the local game checks.',
          code: 'invalid_output',
          retryable: true,
        })
      }
    }
    await pause(pollIntervalMs, options.signal)
  }
}

export async function draftStorylineFromSetting(
  setting: SettingBrief,
  onStarted?: (jobId: string) => void,
  options: CertificationRequestOptions = {},
): Promise<StorylineDefinition> {
  const job = await startStorylineCertification(setting, options)
  onStarted?.(job.jobId)
  return resumeStorylineCertification(job.jobId, { signal: options.signal })
}
