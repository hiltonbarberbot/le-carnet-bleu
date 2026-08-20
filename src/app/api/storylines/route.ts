import { hasAllowedOrigin, isConfigured, storyCertificationModels } from '../../../game/ai/server/author'
import type { StorylineDefinition } from '../../../game/definition/contract'
import { getGameLibraryRepository } from '../../../game/persistence/postgres'
import { listAvailableStorylines } from '../../../game/persistence/library'
import { validatePersistedStoryline } from '../../../game/persistence/validate'
import { launchStorylineCertification } from '../../../game/story/certification/launch'
import { apiError, json, jsonObject, resolveRequestOwner } from '../_shared/http'

export async function GET(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const storylines = await listAvailableStorylines(getGameLibraryRepository(), owner.scope)
    return json(owner, { storylines })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}

export async function POST(request: Request) {
  const owner = resolveRequestOwner(request)
  if (!hasAllowedOrigin(request)) {
    return json(owner, { error: 'Cross-origin certification requests are not allowed.', code: 'invalid_request', retryable: false }, 403)
  }
  if (!isConfigured()) {
    return json(owner, { error: 'Storyline certification is not configured on this deployment.', code: 'not_configured', retryable: false }, 503)
  }
  let definition: StorylineDefinition
  try {
    definition = validatePersistedStoryline(await jsonObject(request))
  } catch (error) {
    return apiError(owner, error)
  }
  try {
    const job = await launchStorylineCertification(
      owner.scope,
      { kind: 'storyline', definition },
      storyCertificationModels(),
    )
    return json(owner, job, 202)
  } catch (error) {
    return apiError(owner, error, 500)
  }
}
