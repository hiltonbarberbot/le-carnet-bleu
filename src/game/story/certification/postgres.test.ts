import { describe, expect, it, vi } from 'vitest'
import { createPostgresCertificationJobRepository } from './postgres'

const scope = { ownerId: 'owner-a' }
const jobId = '22222222-2222-4222-8222-222222222222'

describe('Postgres certification job repository', () => {
  it('scopes polling lookups by both owner and opaque job id', async () => {
    const query = vi.fn().mockResolvedValue([])
    const repository = createPostgresCertificationJobRepository({ query })

    expect(await repository.find(scope, jobId)).toBeUndefined()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id = $1 AND id = $2::uuid'), ['owner-a', jobId])
  })

  it('never lets failure reporting overwrite a successful certification', async () => {
    const query = vi.fn().mockResolvedValue([])
    const repository = createPostgresCertificationJobRepository({ query })

    await repository.markFailed(scope, jobId, {
      code: 'invalid_output',
      message: 'The draft was blocked.',
      retryable: true,
    })

    expect(query).toHaveBeenCalledWith(expect.stringContaining("status <> 'succeeded'"), [
      'owner-a',
      jobId,
      'invalid_output',
      'The draft was blocked.',
      true,
    ])
  })

  it('can bind the run id after a fast workflow has already started', async () => {
    const query = vi.fn().mockResolvedValue([{ id: jobId }])
    const repository = createPostgresCertificationJobRepository({ query })

    await repository.bindWorkflowRun(scope, jobId, 'wrun_fast')

    expect(query).toHaveBeenCalledWith(expect.stringContaining('workflow_run_id IS NULL'), [
      'owner-a',
      jobId,
      'wrun_fast',
    ])
  })
})
