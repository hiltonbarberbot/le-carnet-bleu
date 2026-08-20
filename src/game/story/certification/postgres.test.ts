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
      null,
    ])
  })

  it('stores and reads only the structured public failure details', async () => {
    const details = {
      schemaVersion: 1 as const,
      attemptCount: 2,
      blockingReasons: [{
        stage: 'rehearsal' as const,
        code: 'not_deducible',
        message: 'Players could not reliably deduce the solution from their actual information.',
      }],
    }
    const row = {
      id: jobId,
      owner_id: scope.ownerId,
      status: 'failed',
      error_code: 'invalid_output',
      error_message: 'The story was blocked.',
      retryable: true,
      failure_details: details,
      created_at: '2026-08-20T10:00:00.000Z',
      updated_at: '2026-08-20T10:01:00.000Z',
      completed_at: '2026-08-20T10:01:00.000Z',
    }
    const query = vi.fn().mockResolvedValueOnce([row])
    const repository = createPostgresCertificationJobRepository({ query })

    await expect(repository.find(scope, jobId)).resolves.toMatchObject({
      failure: { details },
    })
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
