import { describe, expect, it } from 'vitest'
import { generateGame } from '../generate'
import type { EnrollingGameState, GameState } from '../types'
import { createLeCarnetBleuRuntime } from './le-carnet-bleu'
import { discoverGames, resolveGame } from './registry'
import { createDemoGame } from '../demo'
import { createGameDefinition } from '../definition/create'

describe('portable game runtime', () => {
  it('declares discoverable identity, player constraints, capabilities, and lifecycle commands', () => {
    const runtime = createLeCarnetBleuRuntime(createDemoGame('discovery'))
    const [discovered] = discoverGames([runtime])
    expect(discovered.manifest).toMatchObject({
      id: 'le-carnet-bleu',
      players: { minHumans: 2, maxHumans: 5, gameSeats: 5, hostRequired: true },
      requiredHostCapabilities: ['state_persistence'],
      authoring: { mode: 'setting_first', requiredBeforeStory: true },
    })
    expect(discovered.runtime.authoredGame.setting.venueName).toBe('Maison Bleue demo house')
    expect(discovered.manifest.commands.map(command => command.name)).toContain('start')
  })

  it('distinguishes multiple authored definitions of the same game engine', () => {
    const first = createDemoGame('first-definition')
    const secondBase = createDemoGame('second-definition')
    const second = createGameDefinition({ ...secondBase, id: 'second-setting', fingerprint: undefined })
    const runtimes = [createLeCarnetBleuRuntime(first), createLeCarnetBleuRuntime(second)]
    expect(discoverGames(runtimes)).toHaveLength(2)
    expect(resolveGame(runtimes, 'second-setting')?.authoredGame.definitionFingerprint).toBe(second.fingerprint)
    expect(resolveGame(runtimes, 'le-carnet-bleu')).toBeNull()
  })

  it('creates a two-human session, assigns AI only at prepare, persists it, and advances via the published interface', () => {
    const runtime = createLeCarnetBleuRuntime(createDemoGame('portable'))
    const definition = createDemoGame('portable')
    const context = { capabilities: { aiControllers: true }, now: new Date('2026-08-18T10:00:00Z'), createId: () => 'portable-1' }
    let result = runtime.createSession({
      host: { id: 'host', displayName: 'Host', privateAddress: 'wa:host' },
      participants: [
        { id: 'alice', displayName: 'Alice', privateAddress: 'wa:alice' },
        { id: 'bob', displayName: 'Bob', privateAddress: 'wa:bob' },
      ],
      allowAiFallback: true,
    }, context)
    expect(result.state.phase).toBe('enrolling')
    const enrolling = result.state as EnrollingGameState
    expect('roster' in enrolling).toBe(false)
    expect(enrolling.setup.seats.filter(seat => seat.humanName)).toHaveLength(2)
    expect(enrolling.setup.seats.filter(seat => seat.allowAiFallback)).toHaveLength(3)

    const setup = { ...enrolling.setup, venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, true])) }
    result = runtime.handleInput(result.state, { name: 'replace_enrolment', payload: { setup } }, context)
    result = runtime.handleInput(result.state, { name: 'prepare' }, context)
    expect(result.state.phase).toBe('prepared')
    if (result.state.phase !== 'prepared') throw new Error('Expected prepared')
    expect(Object.values(result.state.roster).filter(controller => controller.kind === 'human')).toHaveLength(2)
    expect(Object.values(result.state.roster).filter(controller => controller.kind === 'ai')).toHaveLength(3)
    expect(Object.values(result.state.deliveries).filter(delivery => delivery.status === 'not_required')).toHaveLength(3)

    for (const roleId of Object.keys(result.state.deliveries).filter(roleId => result.state.phase === 'prepared' && result.state.deliveries[roleId].status === 'not_requested')) {
      result = runtime.handleInput(result.state, { name: 'request_delivery', payload: { roleId } }, context)
      result = runtime.handleInput(result.state, { name: 'begin_delivery', payload: { roleId } }, context)
      result = runtime.handleInput(result.state, { name: 'record_delivery', payload: { roleId, ok: true, receipt: `wa:${roleId}` } }, context)
    }
    result = runtime.handleInput(result.state, { name: 'start' }, context)
    expect(result.state).toMatchObject({ phase: 'active', playPhase: 'dinner' })
    if (result.state.phase !== 'active') throw new Error('Expected active')
    const story = generateGame(result.state.seed)
    const aiBeat = story.runPlan.find(beat => beat.phase === 'dinner' && beat.dependsOn.length === 0 && beat.actionIds.some(actionId => {
      const owner = story.characters.find(character => character.actions.some(action => action.id === actionId))
      return owner && result.state.phase === 'active' && result.state.roster[owner.id].kind === 'ai'
    }))
    expect(aiBeat).toBeDefined()
    expect(() => runtime.handleInput(result.state, { name: 'confirm_beat', payload: { beatId: aiBeat!.id } }, context)).toThrow(/waiting for AI performance/)
    const aiActionId = aiBeat!.actionIds.find(actionId => {
      const owner = story.characters.find(character => character.actions.some(action => action.id === actionId))
      return owner && result.state.phase === 'active' && result.state.roster[owner.id].kind === 'ai'
    })!
    const aiOwner = story.characters.find(character => character.actions.some(action => action.id === aiActionId))!
    result = runtime.handleInput(result.state, { name: 'record_ai_performance', payload: { roleId: aiOwner.id, actionId: aiActionId, text: 'A bounded in-character line.' } }, context)
    result = runtime.handleInput(result.state, { name: 'confirm_beat', payload: { beatId: aiBeat!.id } }, context)
    expect(result.state.phase === 'active' && result.state.completedBeatIds).toContain(aiBeat!.id)
    const serialized = runtime.serializeState(result.state)
    expect(runtime.restoreState(serialized)).toEqual(result.state)
  })

  it('rejects duplicate participant identities and unknown commands precisely', () => {
    const runtime = createLeCarnetBleuRuntime(createDemoGame('rejections'))
    const context = { capabilities: { aiControllers: true }, createId: () => 'portable-2' }
    expect(() => runtime.createSession({
      host: { id: 'host', displayName: 'Host', privateAddress: 'wa:host' },
      participants: [
        { id: 'same', displayName: 'Alice', privateAddress: 'wa:alice' },
        { id: 'same', displayName: 'Bob', privateAddress: 'wa:bob' },
      ],
    }, context)).toThrow(/distinct/)
    const state: GameState = runtime.createSession({
      host: { id: 'host', displayName: 'Host', privateAddress: 'wa:host' },
      participants: [
        { id: 'alice', displayName: 'Alice', privateAddress: 'wa:alice' },
        { id: 'bob', displayName: 'Bob', privateAddress: 'wa:bob' },
      ],
    }, context).state
    expect(() => runtime.handleInput(state, { name: 'made_up' }, context)).toThrow(/Unknown game command/)
  })
})
