import { parseGameCommand } from '../../../../../game/application/commands'
import { executePersistedGameCommand } from '../../../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../../../game/persistence/postgres'
import { serverRuntimeCapabilities } from '../../../_shared/capabilities'
import { apiError, json, jsonObject, positiveInteger, resolveRequestOwner } from '../../../_shared/http'

type RouteContext = { params: Promise<{ gameId: string }> | { gameId: string } }

export async function POST(request: Request, context: RouteContext) {
  const owner = resolveRequestOwner(request)
  try {
    const { gameId } = await context.params
    const repository = getGameLibraryRepository()
    const current = await repository.findGame(owner.scope, gameId)
    if (!current) return json(owner, { error: 'Game not found.', code: 'not_found' }, 404)
    const body = await jsonObject(request)
    const expectedVersion = positiveInteger(body.expectedVersion, 'expectedVersion')
    if (expectedVersion !== current.version) {
      return json(owner, {
        error: 'The game changed since it was loaded.',
        code: 'version_conflict',
        game: current,
      }, 409)
    }
    const result = await executePersistedGameCommand(repository, owner.scope, {
      game: current,
      expectedVersion,
      command: parseGameCommand(body.command),
      capabilities: serverRuntimeCapabilities(),
    })
    if (result.deleted) return json(owner, { deleted: true, events: result.events })
    if (!result.game) {
      const latest = await repository.findGame(owner.scope, gameId)
      return json(owner, {
        error: 'The game changed while this command was being applied.',
        code: 'version_conflict',
        game: latest,
      }, 409)
    }
    return json(owner, { game: result.game, events: result.events })
  } catch (error) {
    return apiError(owner, error)
  }
}
