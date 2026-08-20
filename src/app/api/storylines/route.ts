import { getGameLibraryRepository } from '../../../game/persistence/postgres'
import {
  listAvailableStorylines,
  publishBundledStorylines,
  saveValidatedStoryline,
} from '../../../game/persistence/library'
import { apiError, json, jsonObject, resolveRequestOwner } from '../_shared/http'

export async function GET(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const repository = getGameLibraryRepository()
    await publishBundledStorylines(repository, owner.scope)
    const storylines = await listAvailableStorylines(repository, owner.scope)
    return json(owner, { storylines })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}

export async function POST(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const storyline = await saveValidatedStoryline(
      getGameLibraryRepository(),
      owner.scope,
      await jsonObject(request),
    )
    return json(owner, {
      storyline,
      status: 'quarantined',
      message: 'Imported storylines stay unavailable until they pass the automatic playability gate.',
    }, 202)
  } catch (error) {
    return apiError(owner, error)
  }
}
