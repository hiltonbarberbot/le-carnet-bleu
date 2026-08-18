import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { POST } from '../../../api/ai/setting'
import { demoSetting } from '../demo'

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateText: vi.fn() }
})

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  delete process.env.VERCEL
  vi.clearAllMocks()
})

function request(prompt = 'An elegant dinner in the village') {
  return new Request('https://example.test/api/ai/setting', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}

describe('AI setting function errors', () => {
  it('explains when drafting is not configured', async () => {
    const response = await POST(request())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'AI drafting is not configured on this deployment.',
      code: 'not_configured',
      retryable: false,
    })
  })

  it('returns a validated setting', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify(demoSetting) } as never)

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.setting).toEqual(demoSetting)
  })

  it('labels rejected generated settings without leaking validation details', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ text: 'not valid JSON' } as never)

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload).toEqual(expect.objectContaining({
      code: 'invalid_output',
      retryable: true,
      reference: expect.stringMatching(/^[A-F0-9]{8}$/),
    }))
    expect(payload.error).not.toContain('Setting brief is incomplete')
    expect(generateText).toHaveBeenCalledTimes(2)
  })
})
