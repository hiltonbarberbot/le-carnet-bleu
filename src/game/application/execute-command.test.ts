import { describe, expect, it } from 'vitest'
import rawManifest from '../../../game.manifest.json' with { type: 'json' }
import { createDemoGame } from '../demo'
import { createIdleState } from '../session/lifecycle'
import type { GameState, SetupDraft } from '../types'
import { gameCommandDescriptors, parseGameCommand, type GameCommand, type GameCommandContext } from './commands'
import { executeGameCommand } from './execute-command'

function activeState(state: GameState) {
  if (state.phase !== 'active') throw new Error('Expected active state.')
  return state
}

describe('game command application boundary', () => {
  it('keeps the public manifest in exact lockstep with the typed command catalogue', () => {
    expect(rawManifest.commands).toEqual(gameCommandDescriptors)
  })

  it('parses external command envelopes before the executor validates their fields', () => {
    expect(parseGameCommand({ name: 'transfer_tokens', payload: { fromRoleId: 'a', toRoleId: 'b', amount: 2 } })).toEqual({
      name: 'transfer_tokens',
      payload: { fromRoleId: 'a', toRoleId: 'b', amount: 2 },
    })
    expect(() => parseGameCommand({ name: 'made_up' })).toThrow(/Unknown game command/)
    expect(() => parseGameCommand({ name: 'prepare', payload: 'wrong' })).toThrow(/payload must be an object/)
  })

  it('owns the full browser lifecycle and gameplay mutation surface', () => {
    const storyline = createDemoGame('application-api')
    const context: GameCommandContext = {
      capabilities: { aiControllers: false },
      now: new Date('2026-08-20T18:00:00Z'),
      createId: () => 'application-game',
    }
    const session: { state: GameState } = { state: createIdleState(storyline) }
    const run = (command: GameCommand) => {
      const result = executeGameCommand({ storyline, state: session.state, command, context })
      session.state = result.state
      return result
    }

    run({ name: 'create' })
    expect(session.state).toMatchObject({ phase: 'enrolling', id: 'application-game' })
    if (session.state.phase !== 'enrolling') throw new Error('Expected enrolling state.')

    const setup: SetupDraft = {
      hostName: 'Blue Host',
      seats: session.state.setup.seats.map((seat, index) => ({ ...seat, humanName: `Player ${index + 1}` })),
      venue: Object.fromEntries(storyline.setupRequirements.map(requirement => [requirement.id, true])),
    }
    run({ name: 'replace_enrolment', payload: { setup } })
    run({ name: 'prepare' })
    run({ name: 'start' })
    expect(session.state).toMatchObject({ phase: 'active', playPhase: 'opening', paused: false })

    const firstStepId = storyline.story.openingSteps[0].id
    run({ name: 'complete_opening_step', payload: { stepId: firstStepId } })
    run({ name: 'undo_opening_step', payload: { stepId: firstStepId } })
    expect(activeState(session.state).completedStepIds).toEqual([])

    run({ name: 'toggle_pause' })
    expect(activeState(session.state).paused).toBe(true)
    expect(() => run({ name: 'complete_opening_step', payload: { stepId: firstStepId } })).toThrow(/paused/)
    run({ name: 'toggle_pause' })

    for (const step of storyline.story.openingSteps) run({ name: 'complete_opening_step', payload: { stepId: step.id } })
    run({ name: 'advance_act' })
    expect(session.state).toMatchObject({ phase: 'active', playPhase: 'investigation' })

    const evidenceId = storyline.story.characters[0].secrets[0].id
    run({ name: 'toggle_evidence', payload: { evidenceId } })
    run({ name: 'transfer_tokens', payload: { fromRoleId: 'solange', toRoleId: 'mathilde', amount: 2 } })
    run({ name: 'lower_clue_price', payload: { price: 3 } })
    run({ name: 'enable_duplicate_clues' })
    const bought = run({ name: 'buy_clue', payload: { roleId: 'mathilde', deckId: storyline.clueDecks[0].id } })
    expect(bought.events[0].message).toBeTruthy()

    const objectiveId = storyline.story.characters.find(character => character.id === 'mathilde')!.objectives[0].id
    run({ name: 'set_objective_completed', payload: { roleId: 'mathilde', objectiveId, completed: true } })
    run({ name: 'call_accusation', payload: { accuserRoleId: 'mathilde', accusedRoleId: 'solange', caseText: 'The evidence points there.' } })
    run({ name: 'advance_hearing' })
    run({ name: 'advance_hearing' })
    run({ name: 'advance_hearing' })
    for (const character of storyline.story.characters) run({ name: 'cast_vote', payload: { roleId: character.id, vote: 'acquit' } })
    expect(activeState(session.state).hearing).toBeNull()

    run({ name: 'end_investigation' })
    run({ name: 'record_award', payload: { award: 'performance', roleId: 'mathilde' } })
    run({ name: 'complete' })
    expect(session.state).toMatchObject({ phase: 'completed', completedAt: '2026-08-20T18:00:00.000Z' })
    run({ name: 'reset', payload: { confirmed: true } })
    expect(session.state.phase).toBe('idle')
  })

  it('supports abort and requires an existing game for destructive lifecycle commands', () => {
    const storyline = createDemoGame('application-abort')
    const context: GameCommandContext = {
      capabilities: { aiControllers: false },
      now: new Date('2026-08-20T19:00:00Z'),
      createId: () => 'aborted-game',
    }
    const idle = createIdleState(storyline)
    expect(() => executeGameCommand({ storyline, state: idle, command: { name: 'abort' }, context })).toThrow(/existing game/)
    const created = executeGameCommand({ storyline, state: idle, command: { name: 'create' }, context }).state
    const aborted = executeGameCommand({ storyline, state: created, command: { name: 'abort' }, context }).state
    expect(aborted).toMatchObject({ phase: 'aborted', previousPhase: 'enrolling', abortedAt: '2026-08-20T19:00:00.000Z' })
    expect(() => executeGameCommand({ storyline, state: aborted, command: { name: 'reset', payload: { confirmed: false } }, context })).toThrow(/explicit confirmation/)
  })

  it('rejects malformed external enrolment fields before they reach lifecycle code', () => {
    const storyline = createDemoGame('application-invalid-setup')
    const context: GameCommandContext = { capabilities: { aiControllers: false } }
    const state = executeGameCommand({
      storyline,
      state: createIdleState(storyline),
      command: { name: 'create' },
      context,
    }).state
    if (state.phase !== 'enrolling') throw new Error('Expected enrolling state.')

    const malformed = structuredClone(state.setup) as unknown as { seats: Array<Record<string, unknown>> }
    malformed.seats[0].humanName = 7
    expect(() => executeGameCommand({
      storyline,
      state,
      command: { name: 'replace_enrolment', payload: { setup: malformed as never } },
      context,
    })).toThrow(/humanName to be a string/)
  })
})
