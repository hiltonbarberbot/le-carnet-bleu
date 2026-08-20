import { describe, expect, it } from 'vitest'
import { createGameRuntime } from '../../game/runtime/game'
import { createDemoStoryline } from '../../game/demo'
import { gameManifest, productNaming } from '../../product/naming'
import { createMemoryChatSessionStore, createOpenClawGameAdapter } from './adapter'

const capabilities = { aiControllers: true, privateMessaging: true, statePersistence: true }
const sender = { id: 'host', displayName: 'Hilton' }
const mentions = [{ id: 'alice', displayName: 'Alice' }, { id: 'bob', displayName: 'Bob' }]
const demoRuntime = (seed: string) => createGameRuntime(createDemoStoryline(seed))

describe('generic OpenClaw game adapter', () => {
  it('enumerates installed portable games without game-specific adapter code', () => {
    const adapter = createOpenClawGameAdapter({ runtimes: [demoRuntime('enumeration')], store: createMemoryChatSessionStore(), capabilities })
    expect(adapter.listGames()).toEqual([expect.objectContaining({ id: gameManifest.id, name: productNaming.name })])
  })

  it('uses a group binding and retains two mentioned humans as distinct participants', () => {
    const adapter = createOpenClawGameAdapter({
      runtimes: [demoRuntime('binding')],
      store: createMemoryChatSessionStore(),
      capabilities,
      bindings: [{ channel: 'whatsapp', conversationId: 'game-group', gameId: gameManifest.id }],
      createId: () => 'openclaw-1',
    })
    const response = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'can we do a run of the game?', sender, mentions })
    expect(response.ok).toBe(true)
    expect(response).toMatchObject({ gameId: gameManifest.id, sessionId: 'openclaw-1', state: { phase: 'enrolling' } })
    if (response.state?.phase !== 'enrolling') throw new Error('Expected enrolling')
    expect(response.state.setup.seats.filter(seat => seat.humanName).map(seat => seat.humanName)).toEqual(['Alice', 'Bob'])
    expect(response.messages.join(' ')).toContain('Alice, Bob')

    const resumed = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'status', sender })
    expect(resumed).toMatchObject({ ok: true, sessionId: 'openclaw-1', state: { phase: 'enrolling' } })

    const definition = createDemoStoryline('binding')
    const setup = {
      ...response.state.setup,
      venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, true])),
    }
    let advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'configure', sender, command: { name: 'replace_enrolment', payload: { setup } } })
    advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'prepare', sender, command: { name: 'prepare' } })
    expect(advanced.state?.phase).toBe('prepared')
    if (advanced.state?.phase !== 'prepared') throw new Error('Expected prepared')
    expect(Object.values(advanced.state.roster).filter(controller => controller.kind === 'human')).toHaveLength(2)
    advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'start', sender, command: { name: 'start' } })
    expect(advanced).toMatchObject({ ok: true, state: { phase: 'active', playPhase: 'opening' } })
  })

  it('lists games in an unbound context and requires explicit selection before starting', () => {
    const adapter = createOpenClawGameAdapter({ runtimes: [demoRuntime('selection')], store: createMemoryChatSessionStore(), capabilities })
    const listed = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'which games are available?', sender })
    expect(listed).toMatchObject({ ok: true })
    expect(listed.messages.join(' ')).toContain(productNaming.name)
    const unselected = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'start the game', sender, mentions })
    expect(unselected).toMatchObject({ ok: false })
    expect(unselected.messages.join(' ')).toContain('No game is selected')
    const selected = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'start the game', game: gameManifest.aliases[0], sender, mentions })
    expect(selected).toMatchObject({ ok: true, gameId: gameManifest.id })
  })

  it('normalizes stable identities and display names in role assignments', () => {
    const adapter = createOpenClawGameAdapter({
      runtimes: [demoRuntime('normalized-participants')],
      store: createMemoryChatSessionStore(),
      capabilities,
      bindings: [{ channel: 'whatsapp', conversationId: 'trimmed', gameId: gameManifest.id }],
    })
    const response = adapter.handle({
      channel: 'whatsapp',
      conversationId: 'trimmed',
      text: 'start the game',
      sender,
      mentions: [{ id: ' alice ', displayName: ' Alice ' }, { id: 'bob', displayName: 'Bob' }],
    })
    expect(response.state?.phase).toBe('enrolling')
    if (response.state?.phase !== 'enrolling') throw new Error('Expected enrolling')
    expect(response.state.setup.seats[0]).toEqual({ roleId: response.state.setup.seats[0].roleId, participantId: 'alice', humanName: 'Alice' })
  })

  it('returns precise installation and compatibility errors', () => {
    const absent = createOpenClawGameAdapter({ runtimes: [], store: createMemoryChatSessionStore(), capabilities })
    expect(absent.handle({ channel: 'whatsapp', conversationId: 'x', text: 'start the game', game: gameManifest.id, sender, mentions }).messages.join(' ')).toContain('not installed')
    const incompatible = createOpenClawGameAdapter({ runtimes: [demoRuntime('compatibility')], store: createMemoryChatSessionStore(), capabilities: { ...capabilities, statePersistence: false } })
    expect(incompatible.handle({ channel: 'whatsapp', conversationId: 'x', text: 'start the game', game: gameManifest.id, sender, mentions }).messages.join(' ')).toContain('state_persistence')
  })
})
