import type { CreateSessionRequest } from '../../../game/runtime/contract'
import { createPersistedGame, StorylineNotPlayableError } from '../../../game/persistence/library'
import { getGameLibraryRepository } from '../../../game/persistence/postgres'
import { serverRuntimeCapabilities } from '../_shared/capabilities'
import { apiError, json, jsonObject, resolveRequestOwner, stringField } from '../_shared/http'

function sessionRequest(value: Record<string, unknown>): CreateSessionRequest {
  const host = value.host
  const participants = value.participants
  if (!host || typeof host !== 'object' || Array.isArray(host)) throw new Error('host must be an object.')
  if (!Array.isArray(participants)) throw new Error('participants must be an array.')
  const hostDisplayName = (host as Record<string, unknown>).displayName
  if (typeof hostDisplayName !== 'string') throw new Error('host.displayName must be a string.')
  return {
    host: { displayName: hostDisplayName.trim() },
    participants: participants.map((participant, index) => {
      if (!participant || typeof participant !== 'object' || Array.isArray(participant)) {
        throw new Error(`participants[${index}] must be an object.`)
      }
      return { displayName: stringField((participant as Record<string, unknown>).displayName, `participants[${index}].displayName`) }
    }),
    allowAiFallback: value.allowAiFallback === true,
  }
}

export async function GET(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const games = await getGameLibraryRepository().listGames(owner.scope)
    return json(owner, { games })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}

export async function POST(request: Request) {
  const owner = resolveRequestOwner(request)
  try {
    const body = await jsonObject(request)
    const game = await createPersistedGame(getGameLibraryRepository(), owner.scope, {
      storylineFingerprint: stringField(body.storylineFingerprint, 'storylineFingerprint'),
      session: sessionRequest(body),
      capabilities: serverRuntimeCapabilities(),
    })
    if (!game) return json(owner, { error: 'Storyline not found.', code: 'not_found' }, 404)
    return json(owner, { game }, 201)
  } catch (error) {
    if (error instanceof StorylineNotPlayableError) {
      return json(owner, { error: error.message, code: error.code }, 422)
    }
    return apiError(owner, error)
  }
}
