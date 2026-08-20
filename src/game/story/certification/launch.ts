import { start } from 'workflow/api'
import type { LibraryScope } from '../../persistence/repository'
import { getCertificationJobRepository } from './postgres'
import {
  certifyStorylineWorkflow,
  type StorylineCertificationInput,
} from './storybook'
import type { CertificationModels } from './steps'

export async function launchStorylineCertification(
  scope: LibraryScope,
  source: StorylineCertificationInput['source'],
  models: CertificationModels,
) {
  const jobId = crypto.randomUUID()
  const jobs = getCertificationJobRepository()
  try {
    await jobs.create(scope, jobId)
    const run = await start(certifyStorylineWorkflow, [{ jobId, scope, source, models }])
    await jobs.bindWorkflowRun(scope, jobId, run.runId)
    return { jobId, status: 'pending' as const }
  } catch (error) {
    await jobs.markFailed(scope, jobId, {
      code: 'unknown',
      message: 'The durable certification job could not be started.',
      retryable: true,
    }).catch(() => undefined)
    throw error
  }
}
