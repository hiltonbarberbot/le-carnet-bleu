import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoStoryline } from '../../../game/demo'
import { launchStorylineCertification } from '../../../game/story/certification/launch'
import { POST } from './route'

vi.mock('../../../game/ai/server/author', () => ({
  hasAllowedOrigin: vi.fn(() => true),
  isConfigured: vi.fn(() => true),
  storyCertificationModels: vi.fn(() => ({
    author: 'author/model',
    review: 'review/model',
    roleRehearsal: 'role/model',
    hostRehearsal: 'host/model',
    rehearsalJudge: 'judge/model',
  })),
}))
vi.mock('../../../game/story/certification/launch', () => ({
  launchStorylineCertification: vi.fn(),
}))

const ownerId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

function request(body: unknown) {
  return new Request('https://example.test/api/storylines', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `mystery_owner=${ownerId}`,
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.clearAllMocks())

describe('storyline import certification', () => {
  it('starts the same durable certification workflow for an imported definition', async () => {
    const definition = createDemoStoryline('review-this-import')
    vi.mocked(launchStorylineCertification).mockResolvedValue({ jobId, status: 'pending' })

    const response = await POST(request(definition))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ jobId, status: 'pending' })
    expect(launchStorylineCertification).toHaveBeenCalledWith(
      { ownerId },
      { kind: 'storyline', definition },
      expect.objectContaining({ review: 'review/model' }),
    )
  })

  it('rejects a malformed definition before creating a certification job', async () => {
    const response = await POST(request({ title: 'Not a complete storyline' }))

    expect(response.status).toBe(400)
    expect(launchStorylineCertification).not.toHaveBeenCalled()
  })

  it('reports a workflow launch failure as infrastructure failure', async () => {
    vi.mocked(launchStorylineCertification).mockRejectedValue(new Error('World unavailable'))

    const response = await POST(request(createDemoStoryline('launch-error')))

    expect(response.status).toBe(500)
  })
})
