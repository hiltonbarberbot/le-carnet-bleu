import { findAvailableStoryline, StorylineNotPlayableError } from '../../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../../game/persistence/postgres'
import { apiError, json, resolveRequestOwner } from '../../_shared/http'

type RouteContext = { params: Promise<{ fingerprint: string }> | { fingerprint: string } }

export async function GET(request: Request, context: RouteContext) {
  const owner = resolveRequestOwner(request)
  try {
    const { fingerprint } = await context.params
    const storyline = await findAvailableStoryline(getGameLibraryRepository(), owner.scope, fingerprint)
    if (!storyline) return json(owner, { error: 'Storyline not found.', code: 'not_found' }, 404)
    return json(owner, { storyline })
  } catch (error) {
    if (error instanceof StorylineNotPlayableError) {
      return json(owner, { error: 'Storyline not found.', code: 'not_found' }, 404)
    }
    return apiError(owner, error, 500)
  }
}
