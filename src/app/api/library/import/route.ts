import { importPersistedLibrary } from '../../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../../game/persistence/postgres'
import { apiError, json, jsonObject, resolveRequestOwner } from '../../_shared/http'

export async function POST(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const body = await jsonObject(request)
    const result = await importPersistedLibrary(getGameLibraryRepository(), owner.scope, {
      storylines: body.storylines,
      sessions: body.sessions,
    })
    return json(owner, result, 201)
  } catch (error) {
    return apiError(owner, error)
  }
}
