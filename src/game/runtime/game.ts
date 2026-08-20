import { gameManifest } from '../../product/naming'
import { executeGameCommand } from '../application/execute-command'
import { createIdleState } from '../session/lifecycle'
import { restoreGameState, serializeGameState } from '../session/storage'
import type { EnrollingGameState, SetupDraft } from '../types'
import type { AuthoredStoryline } from '../story/authoring'
import { createStorylineDefinition } from '../definition/create'
import type { PortableGameRuntime } from './contract'

function enrolParticipants(state: EnrollingGameState, participants: { displayName: string }[], allowAiFallback: boolean): SetupDraft {
  for (const participant of participants) {
    if (!participant.displayName.trim()) throw new Error('Every assigned participant requires a display name.')
  }
  if (participants.length > state.setup.seats.length) throw new Error(`This game has only ${state.setup.seats.length} guest seats.`)
  const seats = state.setup.seats.map((seat, index) => {
    const participant = participants[index]
    return participant
      ? {
          ...seat,
          humanName: participant.displayName.trim(),
          ...(participant.id?.trim() ? { participantId: participant.id.trim() } : {}),
        }
      : { ...seat, allowAiFallback }
  })
  return { ...state.setup, seats }
}

export function createGameRuntime(storyline: AuthoredStoryline): PortableGameRuntime {
  const definition = createStorylineDefinition(storyline)
  return {
    manifest: gameManifest,
    storyline: {
      setting: definition.setting,
      id: definition.id,
      fingerprint: definition.fingerprint,
      storyId: definition.story.id,
      title: definition.story.title,
    },
    createSession(request, context) {
      const created = executeGameCommand({ storyline: definition, state: createIdleState(definition), command: { name: 'create' }, context })
      if (created.state.phase !== 'enrolling') throw new Error('Creating a session did not produce enrolling state.')
      const setup = enrolParticipants(
        { ...created.state, setup: { ...created.state.setup, hostName: request.host.displayName.trim() } },
        request.participants,
        Boolean(request.allowAiFallback),
      )
      const { state } = executeGameCommand({ storyline: definition, state: created.state, command: { name: 'replace_enrolment', payload: { setup } }, context })
      if (state.phase !== 'enrolling') throw new Error('Enrolling a session produced an unexpected state.')
      return { state, events: [{ type: 'session_created', message: `Created ${state.id} with ${request.participants.length} supplied role labels.` }] }
    },
    handleInput(state, command, context) {
      return executeGameCommand({ storyline: definition, state, command, context })
    },
    serializeState(state) {
      return serializeGameState(definition, state)
    },
    restoreState(serialized) {
      return restoreGameState(definition, serialized)
    },
  }
}
