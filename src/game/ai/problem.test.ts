import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiRequestError, requestAiJson } from './problem'

afterEach(() => vi.restoreAllMocks())

describe('AI response reader', () => {
  it('keeps structured failure details for the interface', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      error: 'The AI service is busy.',
      code: 'rate_limited',
      retryable: true,
      reference: 'ABC12345',
    }, { status: 429 }))

    const request = requestAiJson('/api/ai/test', { method: 'POST' })

    await expect(request).rejects.toMatchObject({
      code: 'rate_limited',
      retryable: true,
      reference: 'ABC12345',
      status: 429,
    } satisfies Partial<AiRequestError>)
  })

  it('turns an empty platform timeout into an actionable failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {
      status: 504,
      headers: { 'x-vercel-id': 'iad1::timeout-ref' },
    }))

    await expect(requestAiJson('/api/ai/test', { method: 'POST' })).rejects.toMatchObject({
      code: 'timed_out',
      retryable: true,
      reference: 'iad1::timeout-ref',
    } satisfies Partial<AiRequestError>)
  })
})
