import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { GET, POST } from '../../../api/ai/author'
import { createDemoGame, demoSetting } from '../demo'

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

function request(setting: unknown) {
  return new Request('https://example.test/api/ai/author', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setting }),
  })
}

function generatedDefinition() {
  const { fingerprint: _fingerprint, schemaVersion: _schemaVersion, ...definition } = createDemoGame('ai-authored')
  return definition
}

describe('AI story authoring function', () => {
  it('fails closed without Gateway authentication', async () => {
    expect(await GET().json()).toEqual({ available: false })
    expect((await POST(request(demoSetting))).status).toBe(503)
  })

  it('rejects an incomplete setting before asking the model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const response = await POST(request({ venueName: 'Somewhere' }))
    expect(response.status).toBe(400)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('validates and fingerprints the generated definition', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ output: generatedDefinition() } as never)
    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.definition.fingerprint).toHaveLength(32)
    expect(payload.definition.story.characters).toHaveLength(5)
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: 'anthropic/claude-sonnet-4.6',
      maxOutputTokens: 12000,
    }))
  })

  it('retries a draft that fails the domain checks', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ output: { id: 'broken' } } as never)
    const response = await POST(request(demoSetting))

    expect(response.status).toBe(502)
    expect(generateText).toHaveBeenCalledTimes(2)
  })
})
