import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoStoryline } from '../demo'
import {
  resumeStorylineCertification,
  startStorylineCertification,
} from './author'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storyline certification client', () => {
  it('accepts the asynchronous start contract', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobId: 'job-1', status: 'pending' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    await expect(startStorylineCertification(createDemoStoryline('client-start').setting)).resolves.toEqual({
      jobId: 'job-1',
      status: 'pending',
    })
  })

  it('polls pending work until the certified definition is available', async () => {
    const definition = createDemoStoryline('client-result')
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'job-1', status: 'running' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'job-1', status: 'succeeded', definition })))
    vi.stubGlobal('fetch', fetch)

    await expect(resumeStorylineCertification('job-1', { pollIntervalMs: 0 })).resolves.toEqual(definition)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('surfaces a durable failed job as a typed AI request error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jobId: 'job-1',
      status: 'failed',
      error: 'The mystery remained unplayable.',
      code: 'invalid_output',
      retryable: true,
      details: {
        schemaVersion: 1,
        attemptCount: 2,
        blockingReasons: [{
          stage: 'rehearsal',
          code: 'not_deducible',
          message: 'Players could not reliably deduce the solution.',
        }],
      },
    }))))

    await expect(resumeStorylineCertification('job-1', { pollIntervalMs: 0 })).rejects.toMatchObject({
      message: 'The mystery remained unplayable.',
      code: 'invalid_output',
      retryable: true,
      details: expect.objectContaining({
        attemptCount: 2,
        blockingReasons: [expect.objectContaining({ code: 'not_deducible' })],
      }),
    })
  })

  it('aborts an in-flight poll without translating cleanup into a timeout', async () => {
    const controller = new AbortController()
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)

    const polling = resumeStorylineCertification('job-1', { signal: controller.signal })
    const rejection = expect(polling).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch.mock.calls[0][1]?.signal).toBe(controller.signal)
    controller.abort()

    await rejection
  })

  it('cancels the wait between polls before another request starts', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobId: 'job-1', status: 'running' })))
    vi.stubGlobal('fetch', fetch)

    const polling = resumeStorylineCertification('job-1', {
      pollIntervalMs: 60_000,
      signal: controller.signal,
    })
    const rejection = expect(polling).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    controller.abort()

    await rejection
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
