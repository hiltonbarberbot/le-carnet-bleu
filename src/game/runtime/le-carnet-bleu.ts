import manifest from '../../../game.manifest.json'
import {
  advanceAct,
  beginDelivery,
  completeGame,
  confirmRunBeat,
  createGame,
  prepareGame,
  recordAiPerformance,
  recordDeliveryOutcome,
  requestDelivery,
  revealToTable,
  startGame,
  toggleEvidence,
  updateAccusation,
  updateEnrolment,
} from '../session/lifecycle'
import { restoreGameState, serializeGameState } from '../session/storage'
import type { ActiveGameState, EnrollingGameState, GameState, PreparedGameState, SetupDraft } from '../types'
import type { AuthoredGame } from '../story/authoring'
import { createGameDefinition } from '../definition/create'
import type { GameCommand, GameManifest, PortableGameRuntime, RuntimeContext, RuntimeEvent } from './contract'

export const leCarnetBleuManifest = manifest as GameManifest

function payloadString(command: GameCommand, key: string) {
  const value = command.payload?.[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${command.name} requires ${key}.`)
  return value.trim()
}

function expectPhase<T extends GameState['phase']>(state: GameState, phase: T): Extract<GameState, { phase: T }> {
  if (state.phase !== phase) throw new Error(`${state.phase} cannot handle a command that requires ${phase}.`)
  return state as Extract<GameState, { phase: T }>
}

function changed(state: GameState, message: string, event?: RuntimeEvent): { state: GameState; events: RuntimeEvent[] } {
  return { state, events: [event ?? { type: 'state_changed', message }] }
}

function enrolParticipants(state: EnrollingGameState, participants: { id: string; displayName: string; privateAddress: string }[], allowAiFallback: boolean) {
  const ids = new Set<string>()
  const addresses = new Set<string>()
  for (const participant of participants) {
    if (!participant.id.trim() || !participant.displayName.trim() || !participant.privateAddress.trim()) throw new Error('Every participant requires id, displayName and privateAddress.')
    if (ids.has(participant.id) || addresses.has(participant.privateAddress)) throw new Error('Participants and private addresses must be distinct.')
    ids.add(participant.id)
    addresses.add(participant.privateAddress)
  }
  if (participants.length > state.setup.seats.length) throw new Error(`This game has only ${state.setup.seats.length} guest seats.`)
  const seats = state.setup.seats.map((seat, index) => {
    const participant = participants[index]
    return participant
      ? { ...seat, participantId: participant.id, humanName: participant.displayName, privateAddress: participant.privateAddress, ready: true }
      : { ...seat, allowAiFallback }
  })
  return updateEnrolment(state, { ...state.setup, seats })
}

export function createLeCarnetBleuRuntime(authoredGame: AuthoredGame): PortableGameRuntime {
  const definition = createGameDefinition(authoredGame)
  return {
    manifest: leCarnetBleuManifest,
    authoredGame: {
      setting: definition.setting,
      definitionId: definition.id,
      definitionFingerprint: definition.fingerprint,
      storyId: definition.story.id,
      storyTitle: definition.story.title,
    },
    createSession(request, context) {
      if (request.participants.length < leCarnetBleuManifest.players.minHumans) {
        throw new Error(`Le Carnet Bleu requires at least ${leCarnetBleuManifest.players.minHumans} human guest participants.`)
      }
      let state = createGame(definition, context.now, context.createId?.())
      state = updateEnrolment(state, { ...state.setup, hostName: request.host.displayName.trim() })
      state = enrolParticipants(state, request.participants, Boolean(request.allowAiFallback))
      return { state, events: [{ type: 'session_created', message: `Created ${state.id} with ${request.participants.length} distinct human participants.` }] }
    },
    handleInput(state, command, context) {
      switch (command.name) {
        case 'replace_enrolment': {
          const setup = command.payload?.setup
          if (!setup || typeof setup !== 'object') throw new Error('replace_enrolment requires setup.')
          return changed(updateEnrolment(expectPhase(state, 'enrolling'), setup as SetupDraft), 'Enrolment updated.')
        }
        case 'prepare':
          return changed(prepareGame(definition, expectPhase(state, 'enrolling'), context.capabilities, context.now), 'Roster prepared; no delivery has been attempted.')
        case 'request_delivery': {
          const roleId = payloadString(command, 'roleId')
          const next = requestDelivery(expectPhase(state, 'prepared'), roleId, context.now)
          return changed(next, `Queued dossier for ${roleId}.`, { type: 'delivery_requested', message: `Queue dossier for ${roleId}.`, privateAddress: next.deliveries[roleId].address })
        }
        case 'begin_delivery':
          return changed(beginDelivery(expectPhase(state, 'prepared'), payloadString(command, 'roleId'), context.now), 'Delivery attempt started.')
        case 'record_delivery': {
          const prepared = expectPhase(state, 'prepared')
          const roleId = payloadString(command, 'roleId')
          const ok = command.payload?.ok
          if (typeof ok !== 'boolean') throw new Error('record_delivery requires ok.')
          const next = recordDeliveryOutcome(prepared, roleId, ok
            ? { ok: true, receipt: payloadString(command, 'receipt') }
            : { ok: false, error: payloadString(command, 'error') }, context.now)
          return changed(next, `Delivery for ${roleId} is ${next.deliveries[roleId].status}.`, { type: 'delivery_finished', message: `Delivery for ${roleId} is ${next.deliveries[roleId].status}.` })
        }
        case 'start':
          return changed(startGame(definition, expectPhase(state, 'prepared'), context.now), 'Game started.')
        case 'record_ai_performance':
          return changed(recordAiPerformance(definition, expectPhase(state, 'active'), payloadString(command, 'roleId'), payloadString(command, 'actionId'), payloadString(command, 'text'), context.now), 'AI performance recorded.')
        case 'confirm_beat':
          return changed(confirmRunBeat(definition, expectPhase(state, 'active'), payloadString(command, 'beatId')), 'Beat confirmed.')
        case 'advance_act': {
          const next = advanceAct(definition, expectPhase(state, 'active'))
          return changed(next, next.playPhase === 'investigation' ? 'Investigation started.' : `Advanced to ${next.playPhase}.`)
        }
        case 'toggle_evidence':
          return changed(toggleEvidence(expectPhase(state, 'active'), payloadString(command, 'evidenceId')), 'Evidence tracking updated.')
        case 'accuse': {
          const active = expectPhase(state, 'active')
          return changed(updateAccusation(active, payloadString(command, 'roleId'), {
            culprit: payloadString(command, 'culprit'),
            motive: payloadString(command, 'motive'),
            chain: payloadString(command, 'chain'),
          }), 'Accusation recorded.')
        }
        case 'reveal':
          return changed(revealToTable(definition, expectPhase(state, 'active')), 'Canonical reveal started.')
        case 'complete':
          return changed(completeGame(expectPhase(state, 'active'), context.now), 'Game completed.')
        default:
          throw new Error(`Unknown game command ${command.name}.`)
      }
    },
    serializeState(state) {
      return serializeGameState(definition, state)
    },
    restoreState(serialized) {
      return restoreGameState(definition, serialized)
    },
  }
}
