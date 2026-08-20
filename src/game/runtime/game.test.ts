import { describe, expect, it } from 'vitest'
import type { EnrollingGameState, GameState } from '../types'
import { createGameRuntime } from './game'
import { gameManifest } from '../../product/naming'
import { discoverGames, findMatchingGames, resolveGame } from './registry'
import { createDemoStoryline } from '../demo'
import { createStorylineDefinition } from '../definition/create'
import type { GameCommand } from '../application/commands'

describe('portable game runtime', () => {
  it('declares discoverable identity, player constraints, capabilities, and lifecycle commands', () => {
    const runtime = createGameRuntime(createDemoStoryline('discovery'))
    const [discovered] = discoverGames([runtime])
    expect(discovered.manifest).toMatchObject({
      id: gameManifest.id,
      roles: { suspects: 5, hostRequired: true },
      requiredHostCapabilities: ['state_persistence'],
      authoring: { mode: 'setting_first', requiredBeforeStory: true },
    })
    expect(discovered.runtime.storyline.setting.venueName).toBe('Maison Bleue demo house')
    expect(discovered.manifest.commands.map(command => command.name)).toContain('start')
  })

  it('distinguishes multiple authored definitions of the same game engine', () => {
    const first = createDemoStoryline('first-definition')
    const secondBase = createDemoStoryline('second-definition')
    const second = createStorylineDefinition({ ...secondBase, id: 'second-setting', fingerprint: undefined })
    const runtimes = [createGameRuntime(first), createGameRuntime(second)]
    expect(discoverGames(runtimes)).toHaveLength(2)
    expect(resolveGame(runtimes, 'second-setting')?.storyline.fingerprint).toBe(second.fingerprint)
    expect(findMatchingGames(runtimes, gameManifest.aliases[0])).toEqual(runtimes)
    expect(resolveGame(runtimes, gameManifest.id)).toBeNull()
  })

  it('creates a two-human session, assigns AI only at prepare, persists it, and advances via the published interface', () => {
    const runtime = createGameRuntime(createDemoStoryline('portable'))
    const definition = createDemoStoryline('portable')
    const context = { capabilities: { aiControllers: true }, now: new Date('2026-08-18T10:00:00Z'), createId: () => 'portable-1' }
    let result = runtime.createSession({
      host: { displayName: 'Host' },
      participants: [
        { displayName: 'Alice' },
        { displayName: 'Bob' },
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
    result = runtime.handleInput(result.state, { name: 'start' }, context)
    expect(result.state).toMatchObject({ phase: 'active', playPhase: 'opening' })
    if (result.state.phase !== 'active') throw new Error('Expected active')
    const firstStep = definition.story.openingSteps[0]
    result = runtime.handleInput(result.state, { name: 'complete_opening_step', payload: { stepId: firstStep.id } }, context)
    expect(result.state.phase === 'active' && result.state.completedStepIds).toContain(firstStep.id)
    const serialized = runtime.serializeState(result.state)
    expect(runtime.restoreState(serialized)).toEqual(result.state)
  })

  it('allows repeated assignees and rejects unknown commands precisely', () => {
    const runtime = createGameRuntime(createDemoStoryline('rejections'))
    const context = { capabilities: { aiControllers: true }, createId: () => 'portable-2' }
    const repeated = runtime.createSession({
      host: { displayName: 'Host' },
      participants: [
        { displayName: 'Alice' },
        { displayName: 'Alice' },
      ],
    }, context)
    expect(repeated.state.phase).toBe('enrolling')
    const state: GameState = runtime.createSession({
      host: { displayName: 'Host' },
      participants: [
        { displayName: 'Alice' },
        { displayName: 'Bob' },
      ],
    }, context).state
    expect(() => runtime.handleInput(state, { name: 'made_up' } as unknown as GameCommand, context)).toThrow(/Unknown game command/)
  })
})
