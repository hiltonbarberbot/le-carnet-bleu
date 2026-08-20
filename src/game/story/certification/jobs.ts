import type { AiProblemCode } from '../../ai/problem'
import type { LibraryScope } from '../../persistence/repository'
import type { CertificationFailureDetails } from './feedback'

export type CertificationJobFailure = {
  code: AiProblemCode
  message: string
  retryable: boolean
  details?: CertificationFailureDetails
}

export type CertificationJob = {
  id: string
  ownerId: string
  workflowRunId?: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  storylineFingerprint?: string
  failure?: CertificationJobFailure
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type CertificationJobRepository = {
  create(scope: LibraryScope, jobId: string): Promise<CertificationJob>
  bindWorkflowRun(scope: LibraryScope, jobId: string, workflowRunId: string): Promise<void>
  markRunning(scope: LibraryScope, jobId: string): Promise<void>
  markSucceeded(scope: LibraryScope, jobId: string, storylineFingerprint: string): Promise<void>
  markFailed(scope: LibraryScope, jobId: string, failure: CertificationJobFailure): Promise<void>
  find(scope: LibraryScope, jobId: string): Promise<CertificationJob | undefined>
}
