import { start } from 'workflow/api'
import {
  GET,
  hasAllowedOrigin,
  isConfigured,
  readSetting,
  storyCertificationModels,
} from '../../../../../api/ai/author'
import { createSettingBrief } from '../../../../game/setting/brief'
import { getCertificationJobRepository } from '../../../../game/story/certification/postgres'
import { certifyStorylineWorkflow } from '../../../../game/story/certification/storybook'
import { apiError, json, resolveRequestOwner } from '../../_shared/http'

export { GET }

export async function POST(request: Request) {
  const owner = resolveRequestOwner(request)
  if (!hasAllowedOrigin(request)) {
    return json(owner, { error: 'Cross-origin AI requests are not allowed.', code: 'invalid_request', retryable: false }, 403)
  }
  if (!isConfigured()) {
    return json(owner, { error: 'AI drafting is not configured on this deployment.', code: 'not_configured', retryable: false }, 503)
  }

  let settingInput
  try {
    settingInput = readSetting(await request.json())
  } catch {
    return json(owner, { error: 'Request body must be valid JSON.', code: 'invalid_request', retryable: false }, 400)
  }
  if (!settingInput) {
    return json(owner, { error: 'A setting brief is required.', code: 'invalid_request', retryable: false }, 400)
  }

  let setting
  try {
    setting = createSettingBrief(settingInput)
  } catch (error) {
    return json(owner, {
      error: error instanceof Error ? error.message : 'The setting brief is incomplete.',
      code: 'invalid_request',
      retryable: false,
    }, 400)
  }

  const jobId = crypto.randomUUID()
  const jobs = getCertificationJobRepository()
  try {
    await jobs.create(owner.scope, jobId)
    const run = await start(certifyStorylineWorkflow, [{
      jobId,
      scope: owner.scope,
      setting,
      models: storyCertificationModels(),
    }])
    await jobs.bindWorkflowRun(owner.scope, jobId, run.runId)
    return json(owner, { jobId, status: 'pending' }, 202)
  } catch (error) {
    await jobs.markFailed(owner.scope, jobId, {
      code: 'unknown',
      message: 'The durable certification job could not be started.',
      retryable: true,
    }).catch(() => undefined)
    return apiError(owner, error, 500)
  }
}
