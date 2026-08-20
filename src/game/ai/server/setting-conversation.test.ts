import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoSetting } from '../../demo'
import { POST } from './setting-conversation'

const agentGenerate = vi.hoisted(() => vi.fn())

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    ToolLoopAgent: class {
      generate = agentGenerate
    },
  }
})

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  delete process.env.VERCEL
  vi.clearAllMocks()
})

function request(messages: Array<{ role: 'assistant' | 'user'; content: string }>, draft = {}) {
  return new Request('https://example.test/api/ai/setting/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, draft }),
  })
}

describe('setting conversation agent', () => {
  it('asks conversationally while the validated brief still has gaps', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    agentGenerate.mockResolvedValue({
      output: {
        message: 'Which parts of the house can people actually use during play?',
        draft: { venueName: 'A house', location: 'Grambois', era: '1960s', tone: 'Elegant and funny' },
      },
      text: '',
    })

    const response = await POST(request([
      { role: 'assistant', content: 'Tell me about the place.' },
      { role: 'user', content: 'A house in Grambois, with an elegant funny 1960s mood.' },
    ]))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ready).toBe(false)
    expect(payload.message).toContain('parts of the house')
    expect(payload.draft).toEqual(expect.objectContaining({ venueName: 'A house', location: 'Grambois', era: '1960s' }))
    expect(agentGenerate).toHaveBeenCalledOnce()
    expect(agentGenerate.mock.calls[0]?.[0].prompt).toContain('HOST: A house in Grambois')
  })

  it('only marks a turn ready after the server validates the full draft', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    agentGenerate.mockResolvedValue({
      output: { message: 'I have enough to prepare a concise confirmation.', draft: demoSetting },
      text: '',
    })

    const response = await POST(request([{ role: 'user', content: 'Those are all the real-world details.' }], demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ready).toBe(true)
    expect(payload.draft).toEqual(expect.objectContaining({ venueName: demoSetting.venueName }))
  })

  it('fails before calling the agent when AI drafting is unavailable', async () => {
    const response = await POST(request([{ role: 'user', content: 'A house in Grambois.' }]))

    expect(response.status).toBe(503)
    expect(agentGenerate).not.toHaveBeenCalled()
  })
})
