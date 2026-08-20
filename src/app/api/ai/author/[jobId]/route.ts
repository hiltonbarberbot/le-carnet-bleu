import { getRun } from 'workflow/api'
import { findAvailableStoryline } from '../../../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../../../game/persistence/postgres'
import { getCertificationJobRepository } from '../../../../../game/story/certification/postgres'
import { apiError, json, resolveRequestOwner } from '../../../_shared/http'

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const certificationStaleAfterMs = 4 * 60 * 60 * 1_000

function hasCertificationExpired(updatedAt: string, now = Date.now()) {
  const updatedAtMs = Date.parse(updatedAt)
  return !Number.isFinite(updatedAtMs) || now - updatedAtMs >= certificationStaleAfterMs
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const owner = resolveRequestOwner(request)
  const { jobId } = await context.params
  if (!jobIdPattern.test(jobId)) return json(owner, { error: 'Certification job not found.', code: 'not_found' }, 404)

  try {
    const jobs = getCertificationJobRepository()
    let job = await jobs.find(owner.scope, jobId)
    if (!job) return json(owner, { error: 'Certification job not found.', code: 'not_found' }, 404)

    if (job.status === 'pending' || job.status === 'running') {
      let stopped = false
      if (job.workflowRunId) {
        try {
          const run = getRun(job.workflowRunId)
          if (!await run.exists) {
            stopped = true
          } else {
            const workflowStatus = await run.status
            stopped = workflowStatus === 'failed' || workflowStatus === 'cancelled'
          }
        } catch {
          // A transient World outage must not rewrite a healthy job. The stale
          // deadline below still guarantees that it cannot remain active forever.
        }
      }

      if (stopped || hasCertificationExpired(job.updatedAt)) {
        await jobs.markFailed(owner.scope, jobId, {
          code: 'unknown',
          message: stopped
            ? 'The durable certification workflow stopped before it could finish.'
            : 'The durable certification workflow exceeded its four-hour safety deadline.',
          retryable: true,
        })
        job = (await jobs.find(owner.scope, jobId)) ?? job
      }
    }

    if (job.status === 'succeeded' && job.storylineFingerprint) {
      const definition = await findAvailableStoryline(
        getGameLibraryRepository(),
        owner.scope,
        job.storylineFingerprint,
      )
      if (!definition) throw new Error('The certified storyline result is missing.')
      return json(owner, { jobId, status: 'succeeded', definition })
    }
    if (job.status === 'failed') {
      return json(owner, {
        jobId,
        status: 'failed',
        error: job.failure?.message ?? 'Storyline certification failed.',
        code: job.failure?.code ?? 'unknown',
        retryable: job.failure?.retryable ?? true,
        details: job.failure?.details,
      })
    }
    return json(owner, { jobId, status: job.status })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}
