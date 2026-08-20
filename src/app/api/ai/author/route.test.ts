import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRun } from 'workflow/api'
import { createDemoStoryline, demoSetting } from '../../../../game/demo'
import { findAvailableStoryline } from '../../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../../game/persistence/postgres'
import { getCertificationJobRepository } from '../../../../game/story/certification/postgres'
import { launchStorylineCertification } from '../../../../game/story/certification/launch'
import { POST } from './route'
import { GET as poll } from './[jobId]/route'

vi.mock('workflow/api', () => ({ getRun: vi.fn() }))
vi.mock('../../../../game/persistence/library', () => ({ findAvailableStoryline: vi.fn() }))
vi.mock('../../../../game/story/certification/postgres', () => ({ getCertificationJobRepository: vi.fn() }))
vi.mock('../../../../game/story/certification/launch', () => ({ launchStorylineCertification: vi.fn() }))
vi.mock('../../../../game/persistence/postgres', () => ({ getGameLibraryRepository: vi.fn() }))

const ownerId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

function request(body: unknown, withOwner = true) {
  return new Request('https://example.test/api/ai/author', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withOwner ? { cookie: `mystery_owner=${ownerId}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function jobs(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    bindWorkflowRun: vi.fn().mockResolvedValue(undefined),
    markRunning: vi.fn().mockResolvedValue(undefined),
    markSucceeded: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  vi.clearAllMocks()
})

describe('durable authoring routes', () => {
  it('starts an owner-bound workflow and returns immediately', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(launchStorylineCertification).mockResolvedValue({ jobId, status: 'pending' })

    const response = await POST(request({ setting: demoSetting }))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ jobId, status: 'pending' })
    expect(launchStorylineCertification).toHaveBeenCalledWith(
      { ownerId },
      { kind: 'setting', setting: expect.objectContaining({ venueName: demoSetting.venueName }) },
      expect.objectContaining({ review: expect.any(String) }),
    )
  })

  it('rejects incomplete settings before creating a workflow job', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const repository = jobs()
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)

    const response = await POST(request({ setting: { venueName: 'Only a name' } }))

    expect(response.status).toBe(400)
    expect(launchStorylineCertification).not.toHaveBeenCalled()
  })

  it('does not reveal a job owned by another browser', async () => {
    const repository = jobs({ find: vi.fn().mockResolvedValue(undefined) })
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)

    const response = await poll(
      new Request(`https://example.test/api/ai/author/${jobId}`, { headers: { cookie: `mystery_owner=${ownerId}` } }),
      { params: Promise.resolve({ jobId }) },
    )

    expect(response.status).toBe(404)
    expect(getRun).not.toHaveBeenCalled()
  })

  it('returns only the certified owner result after success', async () => {
    const definition = createDemoStoryline('durable-result')
    const repository = jobs({
      find: vi.fn().mockResolvedValue({
        id: jobId,
        ownerId,
        status: 'succeeded',
        storylineFingerprint: definition.fingerprint,
      }),
    })
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)
    vi.mocked(getGameLibraryRepository).mockReturnValue({} as never)
    vi.mocked(findAvailableStoryline).mockResolvedValue(definition)

    const response = await poll(
      new Request(`https://example.test/api/ai/author/${jobId}`, { headers: { cookie: `mystery_owner=${ownerId}` } }),
      { params: Promise.resolve({ jobId }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jobId, status: 'succeeded', definition })
  })

  it('returns persisted spoiler-safe blocking reasons for a failed job', async () => {
    const details = {
      schemaVersion: 1 as const,
      attemptCount: 2,
      blockingReasons: [{
        stage: 'independent_review' as const,
        code: 'culprit_only_proof',
        message: 'A required deduction depended on information held only by the culprit.',
      }],
    }
    const repository = jobs({
      find: vi.fn().mockResolvedValue({
        id: jobId,
        ownerId,
        status: 'failed',
        failure: {
          code: 'invalid_output',
          message: 'The generated mystery did not pass certification.',
          retryable: true,
          details,
        },
      }),
    })
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)

    const response = await poll(
      new Request(`https://example.test/api/ai/author/${jobId}`, { headers: { cookie: `mystery_owner=${ownerId}` } }),
      { params: Promise.resolve({ jobId }) },
    )

    expect(await response.json()).toEqual(expect.objectContaining({ status: 'failed', details }))
  })

  it('fails closed when the durable run no longer exists', async () => {
    const running = {
      id: jobId,
      ownerId,
      workflowRunId: 'wrun_missing',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const failed = {
      ...running,
      status: 'failed',
      failure: {
        code: 'unknown',
        message: 'The durable certification workflow stopped before it could finish.',
        retryable: true,
      },
    }
    const repository = jobs({ find: vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce(failed) })
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)
    vi.mocked(getRun).mockReturnValue({ exists: Promise.resolve(false) } as never)

    const response = await poll(
      new Request(`https://example.test/api/ai/author/${jobId}`, { headers: { cookie: `mystery_owner=${ownerId}` } }),
      { params: Promise.resolve({ jobId }) },
    )

    expect(repository.markFailed).toHaveBeenCalledWith({ ownerId }, jobId, expect.objectContaining({ retryable: true }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ jobId, status: 'failed' }))
  })

  it('expires a stale job even while its World is temporarily unavailable', async () => {
    const stale = {
      id: jobId,
      ownerId,
      workflowRunId: 'wrun_stale',
      status: 'running',
      createdAt: '2026-08-19T10:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    }
    const failed = {
      ...stale,
      status: 'failed',
      failure: {
        code: 'unknown',
        message: 'The durable certification workflow exceeded its four-hour safety deadline.',
        retryable: true,
      },
    }
    const repository = jobs({ find: vi.fn().mockResolvedValueOnce(stale).mockResolvedValueOnce(failed) })
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)
    vi.mocked(getRun).mockImplementation(() => { throw new Error('World unavailable') })

    const response = await poll(
      new Request(`https://example.test/api/ai/author/${jobId}`, { headers: { cookie: `mystery_owner=${ownerId}` } }),
      { params: Promise.resolve({ jobId }) },
    )

    expect(repository.markFailed).toHaveBeenCalledWith({ ownerId }, jobId, expect.objectContaining({
      message: expect.stringContaining('four-hour'),
    }))
    expect(await response.json()).toEqual(expect.objectContaining({ jobId, status: 'failed' }))
  })
})
