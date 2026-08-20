import type { SetupDraft, GameLifecyclePhase, GameState, RuntimeCapabilities } from '../types'

export type GameCommand =
  | { name: 'create' }
  | { name: 'replace_enrolment'; payload: { setup: SetupDraft } }
  | { name: 'prepare' }
  | { name: 'start' }
  | { name: 'complete_opening_step'; payload: { stepId: string } }
  | { name: 'undo_opening_step'; payload: { stepId: string } }
  | { name: 'advance_act' }
  | { name: 'toggle_evidence'; payload: { evidenceId: string } }
  | { name: 'buy_clue'; payload: { roleId: string; deckId: string } }
  | { name: 'transfer_tokens'; payload: { fromRoleId: string; toRoleId: string; amount: number } }
  | { name: 'lower_clue_price'; payload: { price: number } }
  | { name: 'enable_duplicate_clues' }
  | { name: 'call_accusation'; payload: { accuserRoleId: string; accusedRoleId: string; caseText: string } }
  | { name: 'advance_hearing' }
  | { name: 'cast_vote'; payload: { roleId: string; vote: 'convict' | 'acquit' } }
  | { name: 'end_investigation' }
  | { name: 'set_objective_completed'; payload: { roleId: string; objectiveId: string; completed: boolean } }
  | { name: 'record_award'; payload: { award: 'performance' | 'costume'; roleId: string } }
  | { name: 'toggle_pause' }
  | { name: 'complete' }
  | { name: 'abort' }
  | { name: 'reset'; payload: { confirmed: boolean } }

export type GameCommandName = GameCommand['name']

export type GameCommandContext = {
  capabilities: RuntimeCapabilities
  now?: Date
  createId?: () => string
}

export type GameEvent = {
  type: 'session_created' | 'state_changed' | 'error'
  message: string
}

export type GameCommandResult<State extends GameState = GameState> = {
  state: State
  events: GameEvent[]
}

export type GameCommandDescriptor = {
  name: GameCommandName
  description: string
  allowedPhases: GameLifecyclePhase[]
  payload: Record<string, string>
}

/**
 * Public command discovery metadata. The union above and this catalogue are
 * checked against each other below, so adding a command cannot leave hosts
 * with an incomplete advertised API.
 */
export const gameCommandDescriptors = [
  { name: 'create', description: 'Create an editable game session from an idle storyline.', allowedPhases: ['idle'], payload: {} },
  { name: 'replace_enrolment', description: 'Replace the editable host, seats and venue proof.', allowedPhases: ['enrolling'], payload: { setup: 'SetupDraft' } },
  { name: 'prepare', description: 'Lock the role labels and expose the dossier links.', allowedPhases: ['enrolling'], payload: {} },
  { name: 'start', description: 'Start play when the host is ready.', allowedPhases: ['prepared'], payload: {} },
  { name: 'complete_opening_step', description: 'Complete the next authored opening step.', allowedPhases: ['active'], payload: { stepId: 'string' } },
  { name: 'undo_opening_step', description: 'Undo the most recently completed opening step.', allowedPhases: ['active'], payload: { stepId: 'string' } },
  { name: 'advance_act', description: 'Finish the authored cold open and release the room into continuous investigation.', allowedPhases: ['active'], payload: {} },
  { name: 'toggle_evidence', description: 'Toggle whether a piece of evidence has been revealed.', allowedPhases: ['active'], payload: { evidenceId: 'string' } },
  { name: 'buy_clue', description: 'Spend the current clue price for one private random clue from a chosen deck.', allowedPhases: ['active'], payload: { roleId: 'string', deckId: 'string' } },
  { name: 'transfer_tokens', description: 'Move tradable tokens between two suspect roles.', allowedPhases: ['active'], payload: { fromRoleId: 'string', toRoleId: 'string', amount: 'number' } },
  { name: 'lower_clue_price', description: 'Lower the host-controlled clue price.', allowedPhases: ['active'], payload: { price: 'number' } },
  { name: 'enable_duplicate_clues', description: 'Allow exhausted decks to issue duplicate clues for pacing.', allowedPhases: ['active'], payload: {} },
  { name: 'call_accusation', description: 'Start a public accusation hearing with an accuser, accused suspect, and stated case.', allowedPhases: ['active'], payload: { accuserRoleId: 'string', accusedRoleId: 'string', caseText: 'string' } },
  { name: 'advance_hearing', description: 'Advance the hearing through case, defense, statements, and voting.', allowedPhases: ['active'], payload: {} },
  { name: 'cast_vote', description: "Record one suspect's public conviction vote.", allowedPhases: ['active'], payload: { roleId: 'string', vote: 'convict|acquit' } },
  { name: 'end_investigation', description: 'End investigation when the time limit expires and begin the reveal.', allowedPhases: ['active'], payload: {} },
  { name: 'set_objective_completed', description: 'Record whether one scored character objective was completed.', allowedPhases: ['active'], payload: { roleId: 'string', objectiveId: 'string', completed: 'boolean' } },
  { name: 'record_award', description: 'Record the table-voted performance or costume award.', allowedPhases: ['active'], payload: { award: 'performance|costume', roleId: 'string' } },
  { name: 'toggle_pause', description: 'Pause or resume active play.', allowedPhases: ['active'], payload: {} },
  { name: 'complete', description: 'Complete the revealed game.', allowedPhases: ['active'], payload: {} },
  { name: 'abort', description: 'Abort an unfinished game session.', allowedPhases: ['enrolling', 'prepared', 'active', 'aborted'], payload: {} },
  { name: 'reset', description: 'Discard an existing game and return its storyline to idle.', allowedPhases: ['enrolling', 'prepared', 'active', 'completed', 'aborted'], payload: { confirmed: 'boolean' } },
] satisfies GameCommandDescriptor[]

const gameCommandNames = new Set<GameCommandName>(gameCommandDescriptors.map(command => command.name))

/** Shallowly validates an external command envelope; field values are checked by the executor. */
export function parseGameCommand(value: unknown): GameCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('command must be an object.')
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !gameCommandNames.has(record.name as GameCommandName)) {
    throw new Error(`Unknown game command ${String(record.name)}.`)
  }
  if (record.payload !== undefined && (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload))) {
    throw new Error('command.payload must be an object.')
  }
  return {
    name: record.name,
    ...(record.payload ? { payload: record.payload } : {}),
  } as GameCommand
}

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Assert<Condition extends true> = Condition
type _EveryGameCommandIsDescribed = Assert<Equal<GameCommandName, typeof gameCommandDescriptors[number]['name']>>
