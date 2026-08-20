import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { POST } from '../../../api/ai/setting'
import { demoSetting } from '../demo'
import { createSettingBrief } from '../setting/brief'

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
    expect(payload.setting).toEqual(createSettingBrief(demoSetting))
  })

  it('feeds rejected output back to the model until it returns a valid setting', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: 'not valid JSON' } as never)
      .mockResolvedValueOnce({ text: JSON.stringify(demoSetting) } as never)

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.setting).toEqual(createSettingBrief(demoSetting))
    expect(generateText).toHaveBeenCalledTimes(2)
    expect(vi.mocked(generateText).mock.calls[1]?.[0].prompt).toContain('The prior draft was rejected')
    expect(vi.mocked(generateText).mock.calls[1]?.[0].prompt).toContain('not valid JSON')
  })

  it('returns a validated conservative setting when every model draft is malformed', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ text: 'still not JSON' } as never)

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.setting).toEqual(expect.objectContaining({
      venueName: "Host's venue",
      playableSpaces: expect.arrayContaining([
        expect.objectContaining({ label: 'Main host-approved gathering area' }),
        expect.objectContaining({ label: 'Clue station within the same gathering area' }),
      ]),
    }))
    expect(generateText).toHaveBeenCalledTimes(4)
  })
})
