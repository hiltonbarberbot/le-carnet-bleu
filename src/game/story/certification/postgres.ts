import postgres from 'postgres'
import type { AiProblemCode } from '../../ai/problem'
import type { CertificationJob, CertificationJobRepository } from './jobs'
import { readCertificationFailureDetails } from './feedback'

type QueryRow = Record<string, unknown>

export type CertificationJobQuery = {
  query(query: string, params?: unknown[]): Promise<QueryRow[]>
}

function asIso(value: unknown) {
  return new Date(value as string | Date).toISOString()
}

function readJob(row: QueryRow): CertificationJob {
  const errorCode = typeof row.error_code === 'string' ? row.error_code as AiProblemCode : undefined
  const errorMessage = typeof row.error_message === 'string' ? row.error_message : undefined
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    workflowRunId: typeof row.workflow_run_id === 'string' ? row.workflow_run_id : undefined,
    status: row.status as CertificationJob['status'],
    storylineFingerprint: typeof row.storyline_fingerprint === 'string' ? row.storyline_fingerprint : undefined,
    failure: errorCode && errorMessage
      ? {
          code: errorCode,
          message: errorMessage,
          retryable: Boolean(row.retryable),
          details: readCertificationFailureDetails(row.failure_details),
        }
      : undefined,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    completedAt: row.completed_at ? asIso(row.completed_at) : undefined,
  }
}

export function createPostgresCertificationJobRepository(sql: CertificationJobQuery): CertificationJobRepository {
  return {
    async create(scope, jobId) {
      const rows = await sql.query(
        `INSERT INTO mystery_certification_jobs (id, owner_id)
         VALUES ($1::uuid, $2)
         RETURNING *`,
        [jobId, scope.ownerId],
      )
      if (!rows[0]) throw new Error('The certification job could not be created.')
      return readJob(rows[0])
    },

    async bindWorkflowRun(scope, jobId, workflowRunId) {
      const rows = await sql.query(
        `UPDATE mystery_certification_jobs
            SET workflow_run_id = $3,
                updated_at = NOW()
          WHERE owner_id = $1 AND id = $2::uuid AND workflow_run_id IS NULL
          RETURNING id`,
        [scope.ownerId, jobId, workflowRunId],
      )
      if (!rows[0]) throw new Error('The certification job could not be bound to its workflow run.')
    },

    async markRunning(scope, jobId) {
      await sql.query(
        `UPDATE mystery_certification_jobs
            SET status = 'running', updated_at = NOW()
          WHERE owner_id = $1 AND id = $2::uuid AND status IN ('pending', 'running')`,
        [scope.ownerId, jobId],
      )
    },

    async markSucceeded(scope, jobId, storylineFingerprint) {
      const rows = await sql.query(
        `UPDATE mystery_certification_jobs
            SET status = 'succeeded', storyline_fingerprint = $3,
                error_code = NULL, error_message = NULL, retryable = NULL,
                failure_details = NULL,
                updated_at = NOW(), completed_at = NOW()
          WHERE owner_id = $1 AND id = $2::uuid AND status <> 'succeeded'
          RETURNING id`,
        [scope.ownerId, jobId, storylineFingerprint],
      )
      if (!rows[0]) {
        const existingRows = await sql.query(
          `SELECT * FROM mystery_certification_jobs
            WHERE owner_id = $1 AND id = $2::uuid
            LIMIT 1`,
          [scope.ownerId, jobId],
        )
        const existing = existingRows[0] ? readJob(existingRows[0]) : undefined
        if (existing?.status !== 'succeeded' || existing.storylineFingerprint !== storylineFingerprint) {
          throw new Error('The certification job could not be completed.')
        }
      }
    },

    async markFailed(scope, jobId, failure) {
      await sql.query(
        `UPDATE mystery_certification_jobs
            SET status = 'failed', error_code = $3, error_message = $4,
                retryable = $5, failure_details = $6::jsonb,
                updated_at = NOW(), completed_at = NOW()
          WHERE owner_id = $1 AND id = $2::uuid AND status <> 'succeeded'`,
        [
          scope.ownerId,
          jobId,
          failure.code,
          failure.message,
          failure.retryable,
          failure.details ? JSON.stringify(failure.details) : null,
        ],
      )
    },

    async find(scope, jobId) {
      const rows = await sql.query(
        `SELECT * FROM mystery_certification_jobs
          WHERE owner_id = $1 AND id = $2::uuid
          LIMIT 1`,
        [scope.ownerId, jobId],
      )
      return rows[0] ? readJob(rows[0]) : undefined
    },
  }
}

let repository: CertificationJobRepository | undefined

export function getCertificationJobRepository() {
  if (repository) return repository
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required for certification jobs.')
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
  })
  repository = createPostgresCertificationJobRepository({
    query: async (query, params = []) => [...await sql.unsafe(query, params as never[])],
  })
  return repository
}

export function resetCertificationJobRepositoryForTests() {
  repository = undefined
}
