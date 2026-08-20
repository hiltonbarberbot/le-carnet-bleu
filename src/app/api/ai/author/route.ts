import {
  GET,
  hasAllowedOrigin,
  isConfigured,
  readSetting,
  storyCertificationModels,
} from '../../../../game/ai/server/author'
import { createSettingBrief } from '../../../../game/setting/brief'
import { launchStorylineCertification } from '../../../../game/story/certification/launch'
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

  try {
    const job = await launchStorylineCertification(
      owner.scope,
      { kind: 'setting', setting },
      storyCertificationModels(),
    )
    return json(owner, job, 202)
  } catch (error) {
    return apiError(owner, error, 500)
  }
}
