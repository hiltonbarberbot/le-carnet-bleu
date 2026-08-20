import type { GameCommand, GameCommandContext } from '../application/commands'
import { executeGameCommand } from '../application/execute-command'
import type { StorylineDefinition } from '../definition/contract'
import { createIdleState } from '../session/lifecycle'
import type { ActiveGameState, GameState, SetupDraft } from '../types'
import {
  formatPlayabilityFailure,
  type PlayabilityCheckpoint,
  type PlayabilityCoverage,
  type PlayabilityFailure,
  type PlayabilityTraceEntry,
  type StorylinePlayabilityReport,
} from './contract'

const simulationDate = new Date('2040-01-01T12:00:00.000Z')

class SimulationFailure extends Error {
  constructor(readonly failure: PlayabilityFailure) {
    super(failure.message)
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function expectCondition(condition: unknown, checkpoint: PlayabilityCheckpoint, message: string): asserts condition {
  if (!condition) throw new SimulationFailure({ checkpoint, message })
}

function activeState(state: GameState, checkpoint: PlayabilityCheckpoint): ActiveGameState {
  if (state.phase !== 'active') throw new SimulationFailure({ checkpoint, message: `Expected active state, received ${state.phase}.` })
  return state
}

function sameMembers(actual: string[], expected: string[]) {
  return actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index])
}

/**
 * Drives one deterministic, all-human table through the public command boundary.
 *
 * This is an executable reachability check, not a substitute for the semantic
 * fair-play review. It proves that every authored opening step, evidence item,
 * clue and objective is operable and that both supported resolution paths can
 * reach a completed game.
 */
export function simulateStorylinePlaythrough(definition: StorylineDefinition): StorylinePlayabilityReport {
  const trace: PlayabilityTraceEntry[] = []
  const coverage: PlayabilityCoverage = {
    openingStepIds: [],
    evidenceIds: [],
    clueIds: [],
    objectiveIds: [],
    resolutionKinds: [],
  }
  const context: GameCommandContext = {
    capabilities: { aiControllers: false },
    now: simulationDate,
    createId: () => `simulation-${definition.fingerprint.slice(0, 12)}`,
  }
  let state: GameState

  const run = (checkpoint: PlayabilityCheckpoint, command: GameCommand, detail: string) => {
    try {
      state = executeGameCommand({ storyline: definition, state, command, context }).state
    } catch (error) {
      throw new SimulationFailure({ checkpoint, command: command.name, message: messageOf(error) })
    }
    trace.push({
      checkpoint,
      command: command.name,
      phase: state.phase,
      ...(state.phase === 'active' || state.phase === 'completed' ? { playPhase: state.playPhase } : {}),
      detail,
    })
    return state
  }

  try {
    state = createIdleState(definition)
    const created = run('create_session', { name: 'create' }, 'Created a deterministic host session.')
    expectCondition(created.phase === 'enrolling', 'create_session', `Create produced ${created.phase}, not enrolling.`)

    const setup: SetupDraft = {
      hostName: 'Simulation Host',
      seats: definition.story.characters.map((character, index) => ({
        roleId: character.id,
        humanName: `Simulation Player ${index + 1}`,
      })),
      venue: Object.fromEntries(definition.setupRequirements.map(requirement => [requirement.id, true])),
    }
    run('enrol_players', { name: 'replace_enrolment', payload: { setup } }, 'Assigned every suspect to a human simulation player and confirmed every venue requirement.')
    const prepared = run('prepare_game', { name: 'prepare' }, 'Prepared the complete roster.')
    expectCondition(prepared.phase === 'prepared', 'prepare_game', `Prepare produced ${prepared.phase}, not prepared.`)
    expectCondition(
      sameMembers(Object.keys(prepared.roster), definition.story.characters.map(character => character.id)),
      'prepare_game',
      'Prepared roster does not contain each authored suspect exactly once.',
    )
    expectCondition(Object.values(prepared.roster).every(controller => controller.kind === 'human'), 'prepare_game', 'The all-human simulation produced a non-human or unassigned seat.')

    run('start_game', { name: 'start' }, 'Started the authored opening.')
    expectCondition(definition.story.openingSteps.length > 0, 'opening', 'The storyline has no opening steps to execute.')

    const firstOpeningStep = definition.story.openingSteps[0]
    run('opening', { name: 'complete_opening_step', payload: { stepId: firstOpeningStep.id } }, `Completed opening step ${firstOpeningStep.id}.`)
    run('opening', { name: 'undo_opening_step', payload: { stepId: firstOpeningStep.id } }, `Confirmed opening step ${firstOpeningStep.id} can be safely undone.`)
    for (const step of definition.story.openingSteps) {
      run('opening', { name: 'complete_opening_step', payload: { stepId: step.id } }, `Completed opening step ${step.id} in authored order.`)
      coverage.openingStepIds.push(step.id)
    }
    run('opening', { name: 'advance_act' }, 'Released the table from the authored opening into continuous investigation.')
    expectCondition(activeState(state, 'investigation').playPhase === 'investigation', 'investigation', 'Completing the opening did not reach investigation.')

    run('investigation', { name: 'toggle_pause' }, 'Paused active play.')
    expectCondition(activeState(state, 'investigation').paused, 'investigation', 'Pause command did not pause the game.')
    run('investigation', { name: 'toggle_pause' }, 'Resumed active play.')
    expectCondition(!activeState(state, 'investigation').paused, 'investigation', 'Resume command left the game paused.')

    const evidenceIds = [
      ...definition.story.publicEvidence.map(evidence => evidence.id),
      ...definition.story.characters.flatMap(character => character.secrets.map(secret => secret.id)),
    ]
    for (const evidenceId of evidenceIds) {
      run('evidence', { name: 'toggle_evidence', payload: { evidenceId } }, `Toggled evidence ${evidenceId}.`)
      run('evidence', { name: 'toggle_evidence', payload: { evidenceId } }, `Restored evidence ${evidenceId} after testing its control.`)
      coverage.evidenceIds.push(evidenceId)
    }

    const roleIds = definition.story.characters.map(character => character.id)
    expectCondition(roleIds.length >= 3, 'investigation', 'Accusation simulation requires at least three distinct suspect roles.')
    expectCondition(new Set(roleIds).size === roleIds.length, 'prepare_game', 'Suspect role IDs are not unique.')
    run('economy', { name: 'transfer_tokens', payload: { fromRoleId: roleIds[0], toRoleId: roleIds[1], amount: 1 } }, 'Transferred one token between players.')
    run('economy', { name: 'lower_clue_price', payload: { price: 1 } }, 'Lowered the clue price to exercise every authored card affordably.')

    let buyerIndex = 0
    for (const deck of definition.clueDecks) {
      for (let index = 0; index < deck.clues.length; index += 1) {
        const before = activeState(state, 'clues').ownedClueIds[roleIds[buyerIndex % roleIds.length]].length
        const buyerRoleId = roleIds[buyerIndex % roleIds.length]
        run('clues', { name: 'buy_clue', payload: { roleId: buyerRoleId, deckId: deck.id } }, `Bought one clue from ${deck.id} for ${buyerRoleId}.`)
        const owned = activeState(state, 'clues').ownedClueIds[buyerRoleId]
        expectCondition(owned.length === before + 1, 'clues', `Buying from ${deck.id} did not add exactly one clue for ${buyerRoleId}.`)
        coverage.clueIds.push(owned.at(-1)!)
        buyerIndex += 1
      }
    }
    const authoredClueIds = definition.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id))
    expectCondition(sameMembers(coverage.clueIds, authoredClueIds), 'clues', 'The simulation could not draw every authored clue exactly once.')
    expectCondition(definition.clueDecks.length > 0 && definition.clueDecks[0].clues.length > 0, 'clues', 'Duplicate-clue pacing requires at least one non-empty clue deck.')
    run('clues', { name: 'enable_duplicate_clues' }, 'Enabled the host pacing fallback for exhausted decks.')
    run('clues', { name: 'buy_clue', payload: { roleId: roleIds[0], deckId: definition.clueDecks[0].id } }, 'Confirmed an exhausted deck can issue a duplicate clue when the host enables it.')

    for (const character of definition.story.characters) {
      for (const objective of character.objectives) {
        run('objectives', { name: 'set_objective_completed', payload: { roleId: character.id, objectiveId: objective.id, completed: true } }, `Scored objective ${objective.id} for ${character.id}.`)
        coverage.objectiveIds.push(objective.id)
      }
    }

    const investigationSnapshot = structuredClone(activeState(state, 'timeout_resolution'))
    run('timeout_resolution', { name: 'end_investigation' }, 'Ended one branch on the time limit.')
    expectCondition(activeState(state, 'timeout_resolution').outcome?.kind === 'time_expired', 'timeout_resolution', 'The time-limit branch did not produce its canonical outcome.')
    coverage.resolutionKinds.push('time_expired')
    const timedCompletion = run('completion', { name: 'complete' }, 'Completed the time-limit branch.')
    expectCondition(timedCompletion.phase === 'completed', 'completion', `Time-limit completion produced ${timedCompletion.phase}.`)

    state = investigationSnapshot
    const nonCulpritRoleIds = roleIds.filter(roleId => roleId !== definition.story.culpritRoleId)
    expectCondition(nonCulpritRoleIds.length >= 2, 'failed_accusation', 'The hearing simulation needs two non-culprit roles.')
    run('failed_accusation', {
      name: 'call_accusation',
      payload: { accuserRoleId: nonCulpritRoleIds[0], accusedRoleId: nonCulpritRoleIds[1], caseText: 'Deterministic simulation of a rejected case.' },
    }, 'Called a deliberately unsuccessful accusation.')
    for (let stage = 0; stage < 3; stage += 1) run('failed_accusation', { name: 'advance_hearing' }, `Advanced the failed hearing through stage ${stage + 1}.`)
    for (const roleId of roleIds) run('failed_accusation', { name: 'cast_vote', payload: { roleId, vote: 'acquit' } }, `Recorded ${roleId}'s acquittal vote.`)
    expectCondition(activeState(state, 'failed_accusation').hearing === null, 'failed_accusation', 'A fully voted failed hearing did not close.')
    expectCondition(activeState(state, 'failed_accusation').hearingHistory.at(-1)?.result === 'failed', 'failed_accusation', 'The acquittal branch did not record a failed hearing.')
    expectCondition(activeState(state, 'failed_accusation').playPhase === 'investigation', 'failed_accusation', 'A failed accusation did not return to open investigation.')

    run('conviction', {
      name: 'call_accusation',
      payload: { accuserRoleId: nonCulpritRoleIds[0], accusedRoleId: definition.story.culpritRoleId, caseText: 'The authored evidence supports the canonical culprit.' },
    }, 'Called the canonical accusation.')
    for (let stage = 0; stage < 3; stage += 1) run('conviction', { name: 'advance_hearing' }, `Advanced the conviction hearing through stage ${stage + 1}.`)
    for (const roleId of roleIds) run('conviction', { name: 'cast_vote', payload: { roleId, vote: 'convict' } }, `Recorded ${roleId}'s conviction vote.`)
    const revealed = activeState(state, 'conviction')
    expectCondition(revealed.playPhase === 'reveal', 'conviction', 'A unanimous correct conviction did not reach the reveal.')
    expectCondition(revealed.outcome?.kind === 'conviction' && revealed.outcome.accusedRoleId === definition.story.culpritRoleId, 'conviction', 'The conviction outcome does not identify the authored culprit.')
    coverage.resolutionKinds.push('conviction')

    run('awards', { name: 'record_award', payload: { award: 'performance', roleId: roleIds[0] } }, 'Recorded the performance award during reveal.')
    run('awards', { name: 'record_award', payload: { award: 'costume', roleId: roleIds[1] } }, 'Recorded the costume award during reveal.')
    const convictionCompletion = run('completion', { name: 'complete' }, 'Completed the correct-conviction branch and calculated final scores.')
    expectCondition(convictionCompletion.phase === 'completed', 'completion', `Conviction completion produced ${convictionCompletion.phase}.`)
    expectCondition(sameMembers(Object.keys(convictionCompletion.finalScores), roleIds), 'completion', 'Final scoring did not include every suspect exactly once.')

    return {
      schemaVersion: 1,
      definitionFingerprint: definition.fingerprint,
      verdict: 'pass',
      summary: `Runtime reachability passed across ${trace.length} public commands covering opening, investigation, both resolutions, reveal and scoring. This does not certify social play.`,
      trace,
      coverage,
      failure: null,
    }
  } catch (error) {
    const failure = error instanceof SimulationFailure
      ? error.failure
      : { checkpoint: 'create_session' as const, message: messageOf(error) }
    return {
      schemaVersion: 1,
      definitionFingerprint: definition.fingerprint,
      verdict: 'fail',
      summary: `Runtime reachability stopped at ${failure.checkpoint}.`,
      trace,
      coverage,
      failure,
    }
  }
}

export function assertStorylinePlayable(definition: StorylineDefinition): StorylinePlayabilityReport {
  const report = simulateStorylinePlaythrough(definition)
  if (report.verdict === 'fail') throw new Error(formatPlayabilityFailure(report))
  return report
}
