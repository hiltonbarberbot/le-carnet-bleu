import { afterEach, describe, expect, it, vi } from 'vitest'
import { start } from 'workflow/api'
import { createDemoStoryline } from '../../demo'
import { getCertificationJobRepository } from './postgres'
import { launchStorylineCertification } from './launch'

vi.mock('workflow/api', () => ({ start: vi.fn() }))
vi.mock('./postgres', () => ({ getCertificationJobRepository: vi.fn() }))

const scope = { ownerId: 'owner-a' }
const models = {
  author: 'author/model',
  review: 'review/model',
  roleRehearsal: 'role/model',
  hostRehearsal: 'host/model',
  tableRehearsal: 'table/model',
  rehearsalJudge: 'judge/model',
}

function jobs() {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    bindWorkflowRun: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('certification launcher', () => {
  it('creates and binds one durable job for either certification source', async () => {
    const repository = jobs()
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)
    vi.mocked(start).mockResolvedValue({ runId: 'wrun_test' } as never)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222')
    const source = { kind: 'storyline' as const, definition: createDemoStoryline('launch-import') }

    await expect(launchStorylineCertification(scope, source, models)).resolves.toEqual({
      jobId: '22222222-2222-4222-8222-222222222222',
      status: 'pending',
    })
    expect(repository.create).toHaveBeenCalledWith(scope, '22222222-2222-4222-8222-222222222222')
    expect(start).toHaveBeenCalledWith(expect.any(Function), [expect.objectContaining({ scope, source, models })])
    expect(repository.bindWorkflowRun).toHaveBeenCalledWith(scope, '22222222-2222-4222-8222-222222222222', 'wrun_test')
  })

  it('records a launch failure without exposing a half-started job', async () => {
    const repository = jobs()
    vi.mocked(getCertificationJobRepository).mockReturnValue(repository as never)
    vi.mocked(start).mockRejectedValue(new Error('world unavailable'))
    const source = { kind: 'storyline' as const, definition: createDemoStoryline('failed-launch') }

    await expect(launchStorylineCertification(scope, source, models)).rejects.toThrow('world unavailable')
    expect(repository.markFailed).toHaveBeenCalledWith(scope, expect.any(String), expect.objectContaining({ retryable: true }))
  })
})
