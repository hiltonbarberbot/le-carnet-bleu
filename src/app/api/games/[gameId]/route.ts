import { getGameLibraryRepository } from '../../../../game/persistence/postgres'
import { apiError, json, resolveRequestOwner } from '../../_shared/http'

type RouteContext = { params: Promise<{ gameId: string }> | { gameId: string } }

export async function GET(request: Request, context: RouteContext) {
  const owner = resolveRequestOwner(request)
  try {
    const { gameId } = await context.params
    const game = await getGameLibraryRepository().findGame(owner.scope, gameId)
    if (!game) return json(owner, { error: 'Game not found.', code: 'not_found' }, 404)
    return json(owner, { game })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}
