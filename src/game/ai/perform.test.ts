import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { GET, POST } from '../../../api/ai/perform'
import { generateGame } from '../generate'

vi.mock('ai', () => ({ generateText: vi.fn() }))

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  vi.clearAllMocks()
})

describe('AI performance function', () => {
  it('fails closed when Gateway authentication is unavailable', async () => {
    expect(await GET().json()).toEqual({ available: false })

    const response = await POST(new Request('https://example.test/api/ai/perform', {
      method: 'POST',
      body: '{}',
    }))
    expect(response.status).toBe(503)
  })

  it('rejects roles and actions outside the authored case', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const response = await POST(new Request('https://example.test/api/ai/perform', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', seed: 'bleu', roleId: 'intruder', actionId: 'invented' }),
    }))

    expect(response.status).toBe(404)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('rejects cross-origin browser calls', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const response = await POST(new Request('https://game.example/api/ai/perform', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', host: 'game.example' },
      body: '{}',
    }))

    expect(response.status).toBe(403)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('generates a bounded performance for an authored action', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(generateText).mockResolvedValue({ text: 'Ce carnet ne vous regarde pas.' } as never)
    const story = generateGame('bleu')
    const character = story.characters[0]
    const action = character.actions[0]

    const response = await POST(new Request('https://example.test/api/ai/perform', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', seed: story.seed, roleId: character.id, actionId: action.id }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      text: 'Ce carnet ne vous regarde pas.',
      model: 'anthropic/claude-sonnet-4.6',
    })
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: 'anthropic/claude-sonnet-4.6',
      maxOutputTokens: 120,
      providerOptions: { gateway: { user: 'session-1', tags: ['le-carnet-bleu', 'ai-player'] } },
    }))
  })
})
