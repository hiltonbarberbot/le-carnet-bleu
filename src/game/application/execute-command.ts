import type { StorylineDefinition } from '../definition/contract'
import {
  abortGame,
  advanceAct,
  advanceHearing,
  buyClue,
  callAccusation,
  castVote,
  completeGame,
  completeOpeningStep,
  createGame,
  enableDuplicateClues,
  endInvestigation,
  lowerCluePrice,
  prepareGame,
  recordAward,
  resetGame,
  setObjectiveCompleted,
  startGame,
  toggleEvidence,
  togglePause,
  transferTokens,
  undoOpeningStep,
  updateEnrolment,
} from '../session/lifecycle'
import type { ExistingGameState, GameState, SetupDraft } from '../types'
import type { GameCommand, GameCommandContext, GameCommandResult, GameEvent } from './commands'

export type ExecuteGameCommandInput = {
  storyline: StorylineDefinition
  state: GameState
  command: GameCommand
  context: GameCommandContext
}

function expectPhase<Phase extends GameState['phase']>(state: GameState, phase: Phase): Extract<GameState, { phase: Phase }> {
  if (state.phase !== phase) throw new Error(`${state.phase} cannot handle a command that requires ${phase}.`)
  return state as Extract<GameState, { phase: Phase }>
}

function expectExisting(state: GameState): ExistingGameState {
  if (state.phase === 'idle') throw new Error('idle cannot handle a command that requires an existing game.')
  return state
}

function requiredString(value: unknown, command: GameCommand['name'], key: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${command} requires ${key}.`)
  return value.trim()
}

function requiredNumber(value: unknown, command: GameCommand['name'], key: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${command} requires numeric ${key}.`)
  return value
}

function requiredBoolean(value: unknown, command: GameCommand['name'], key: string) {
  if (typeof value !== 'boolean') throw new Error(`${command} requires boolean ${key}.`)
  return value
}

function requiredSetupDraft(value: unknown): SetupDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('replace_enrolment requires setup.')
  const setup = value as Record<string, unknown>
  if (typeof setup.hostName !== 'string') throw new Error('replace_enrolment requires setup.hostName to be a string.')
  if (!Array.isArray(setup.seats)) throw new Error('replace_enrolment requires setup.seats to be an array.')
  const seats = setup.seats.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`replace_enrolment requires setup.seats[${index}] to be an object.`)
    const seat = value as Record<string, unknown>
    if (typeof seat.roleId !== 'string' || !seat.roleId.trim()) throw new Error(`replace_enrolment requires setup.seats[${index}].roleId.`)
    if (typeof seat.humanName !== 'string') throw new Error(`replace_enrolment requires setup.seats[${index}].humanName to be a string.`)
    if (seat.allowAiFallback !== undefined && typeof seat.allowAiFallback !== 'boolean') throw new Error(`replace_enrolment requires setup.seats[${index}].allowAiFallback to be boolean.`)
    return {
      roleId: seat.roleId,
      humanName: seat.humanName,
      ...(typeof seat.participantId === 'string' && seat.participantId.trim() ? { participantId: seat.participantId.trim() } : {}),
      ...(seat.allowAiFallback === undefined ? {} : { allowAiFallback: seat.allowAiFallback }),
    }
  })
  if (!setup.venue || typeof setup.venue !== 'object' || Array.isArray(setup.venue)) throw new Error('replace_enrolment requires setup.venue to be an object.')
  const venue = Object.fromEntries(Object.entries(setup.venue as Record<string, unknown>).map(([id, checked]) => {
    if (typeof checked !== 'boolean') throw new Error(`replace_enrolment requires setup.venue.${id} to be boolean.`)
    return [id, checked]
  }))
  return { hostName: setup.hostName, seats, venue }
}

function changed(state: GameState, message: string, event?: GameEvent): GameCommandResult {
  return { state, events: [event ?? { type: 'state_changed', message }] }
}

/** The single state-changing application boundary shared by web and portable hosts. */
export function executeGameCommand({ storyline, state, command, context }: ExecuteGameCommandInput): GameCommandResult {
  switch (command.name) {
    case 'create':
      expectPhase(state, 'idle')
      return changed(createGame(storyline, context.now, context.createId?.()), 'Game created.')
    case 'replace_enrolment': {
      const setup = requiredSetupDraft(command.payload?.setup)
      return changed(updateEnrolment(expectPhase(state, 'enrolling'), setup), 'Enrolment updated.')
    }
    case 'prepare':
      return changed(prepareGame(storyline, expectPhase(state, 'enrolling'), context.capabilities, context.now), 'Role assignments prepared.')
    case 'start':
      return changed(startGame(storyline, expectPhase(state, 'prepared'), context.now), 'Game started.')
    case 'complete_opening_step':
      return changed(completeOpeningStep(storyline, expectPhase(state, 'active'), requiredString(command.payload?.stepId, command.name, 'stepId')), 'Opening step completed.')
    case 'undo_opening_step':
      return changed(undoOpeningStep(storyline, expectPhase(state, 'active'), requiredString(command.payload?.stepId, command.name, 'stepId')), 'Opening step undone.')
    case 'advance_act': {
      const next = advanceAct(storyline, expectPhase(state, 'active'))
      return changed(next, next.playPhase === 'investigation' ? 'Investigation started.' : `Advanced to ${next.playPhase}.`)
    }
    case 'toggle_evidence':
      return changed(toggleEvidence(storyline, expectPhase(state, 'active'), requiredString(command.payload?.evidenceId, command.name, 'evidenceId')), 'Evidence tracking updated.')
    case 'buy_clue': {
      const active = expectPhase(state, 'active')
      const roleId = requiredString(command.payload?.roleId, command.name, 'roleId')
      const next = buyClue(storyline, active, roleId, requiredString(command.payload?.deckId, command.name, 'deckId'))
      const clueId = next.ownedClueIds[roleId].at(-1)!
      const clue = storyline.clueDecks.flatMap(deck => deck.clues).find(item => item.id === clueId)!
      return changed(next, `Clue purchased for ${roleId}.`, { type: 'state_changed', message: clue.text })
    }
    case 'transfer_tokens':
      return changed(transferTokens(expectPhase(state, 'active'), requiredString(command.payload?.fromRoleId, command.name, 'fromRoleId'), requiredString(command.payload?.toRoleId, command.name, 'toRoleId'), requiredNumber(command.payload?.amount, command.name, 'amount')), 'Tokens transferred.')
    case 'lower_clue_price':
      return changed(lowerCluePrice(expectPhase(state, 'active'), requiredNumber(command.payload?.price, command.name, 'price')), 'Clue price lowered.')
    case 'enable_duplicate_clues':
      return changed(enableDuplicateClues(expectPhase(state, 'active')), 'Duplicate clues enabled.')
    case 'call_accusation':
      return changed(callAccusation(expectPhase(state, 'active'), requiredString(command.payload?.accuserRoleId, command.name, 'accuserRoleId'), requiredString(command.payload?.accusedRoleId, command.name, 'accusedRoleId'), requiredString(command.payload?.caseText, command.name, 'caseText')), 'Accusation hearing started.')
    case 'advance_hearing':
      return changed(advanceHearing(expectPhase(state, 'active')), 'Accusation hearing advanced.')
    case 'cast_vote': {
      const vote = command.payload?.vote
      if (vote !== 'convict' && vote !== 'acquit') throw new Error('cast_vote requires vote to be convict or acquit.')
      const next = castVote(storyline, expectPhase(state, 'active'), requiredString(command.payload?.roleId, command.name, 'roleId'), vote)
      return changed(next, next.playPhase === 'reveal' ? 'The vote convicted a suspect; reveal started.' : 'Vote recorded.')
    }
    case 'end_investigation':
      return changed(endInvestigation(expectPhase(state, 'active')), 'Time expired; canonical reveal started.')
    case 'set_objective_completed':
      return changed(setObjectiveCompleted(storyline, expectPhase(state, 'active'), requiredString(command.payload?.roleId, command.name, 'roleId'), requiredString(command.payload?.objectiveId, command.name, 'objectiveId'), requiredBoolean(command.payload?.completed, command.name, 'completed')), 'Objective score updated.')
    case 'record_award': {
      const award = command.payload?.award
      if (award !== 'performance' && award !== 'costume') throw new Error('record_award requires performance or costume.')
      return changed(recordAward(storyline, expectPhase(state, 'active'), award, requiredString(command.payload?.roleId, command.name, 'roleId')), 'Table award recorded.')
    }
    case 'toggle_pause': {
      const next = togglePause(expectPhase(state, 'active'))
      return changed(next, next.paused ? 'Game paused.' : 'Game resumed.')
    }
    case 'complete':
      return changed(completeGame(storyline, expectPhase(state, 'active'), context.now), 'Game completed.')
    case 'abort':
      return changed(abortGame(expectExisting(state), context.now), 'Game aborted.')
    case 'reset':
      return changed(resetGame(storyline, state, requiredBoolean(command.payload?.confirmed, command.name, 'confirmed')), 'Game reset.')
    default: {
      const unreachable: never = command
      throw new Error(`Unknown game command ${(unreachable as { name?: unknown }).name}.`)
    }
  }
}
