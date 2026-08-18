import { describe, expect, it } from 'vitest'
import { createLeCarnetBleuRuntime } from '../../game/runtime/le-carnet-bleu'
import { venueChecks } from '../../game/session/lifecycle'
import { createMemoryChatSessionStore, createOpenClawGameAdapter } from './adapter'

const capabilities = { aiControllers: true, privateMessaging: true, statePersistence: true }
const sender = { id: 'host', displayName: 'Hilton' }
const mentions = [{ id: 'alice', displayName: 'Alice' }, { id: 'bob', displayName: 'Bob' }]

describe('generic OpenClaw game adapter', () => {
  it('enumerates installed portable games without game-specific adapter code', () => {
    const adapter = createOpenClawGameAdapter({ runtimes: [createLeCarnetBleuRuntime()], store: createMemoryChatSessionStore(), capabilities })
    expect(adapter.listGames()).toEqual([expect.objectContaining({ id: 'le-carnet-bleu', name: 'Le Carnet Bleu' })])
  })

  it('uses a group binding and retains two mentioned humans as distinct participants', () => {
    const adapter = createOpenClawGameAdapter({
      runtimes: [createLeCarnetBleuRuntime()],
      store: createMemoryChatSessionStore(),
      capabilities,
      bindings: [{ channel: 'whatsapp', conversationId: 'game-group', gameId: 'le-carnet-bleu' }],
      createId: () => 'openclaw-1',
    })
    const response = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'can we do a run of the game?', sender, mentions })
    expect(response.ok).toBe(true)
    expect(response).toMatchObject({ gameId: 'le-carnet-bleu', sessionId: 'openclaw-1', state: { phase: 'enrolling' } })
    if (response.state?.phase !== 'enrolling') throw new Error('Expected enrolling')
    expect(response.state.setup.seats.filter(seat => seat.humanName).map(seat => seat.humanName)).toEqual(['Alice', 'Bob'])
    expect(response.messages.join(' ')).toContain('Alice, Bob')

    const resumed = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'status', sender })
    expect(resumed).toMatchObject({ ok: true, sessionId: 'openclaw-1', state: { phase: 'enrolling' } })

    const setup = {
      ...response.state.setup,
      venue: Object.fromEntries(venueChecks.map(check => [check.id, true])),
    }
    let advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'configure', sender, command: { name: 'replace_enrolment', payload: { setup } } })
    advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'prepare', sender, command: { name: 'prepare' } })
    expect(advanced.state?.phase).toBe('prepared')
    if (advanced.state?.phase !== 'prepared') throw new Error('Expected prepared')
    expect(Object.values(advanced.state.roster).filter(controller => controller.kind === 'human')).toHaveLength(2)
    const humanRoleIds = Object.keys(advanced.state.deliveries).filter(roleId => advanced.state?.phase === 'prepared' && advanced.state.deliveries[roleId].status === 'not_requested')
    for (const roleId of humanRoleIds) {
      advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'queue', sender, command: { name: 'request_delivery', payload: { roleId } } })
      advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'send', sender, command: { name: 'begin_delivery', payload: { roleId } } })
      advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'delivered', sender, command: { name: 'record_delivery', payload: { roleId, ok: true, receipt: `whatsapp:${roleId}` } } })
    }
    advanced = adapter.handle({ channel: 'whatsapp', conversationId: 'game-group', text: 'start', sender, command: { name: 'start' } })
    expect(advanced).toMatchObject({ ok: true, state: { phase: 'active', playPhase: 'dinner' } })
  })

  it('lists games in an unbound context and requires explicit selection before starting', () => {
    const adapter = createOpenClawGameAdapter({ runtimes: [createLeCarnetBleuRuntime()], store: createMemoryChatSessionStore(), capabilities })
    const listed = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'which games are available?', sender })
    expect(listed).toMatchObject({ ok: true })
    expect(listed.messages.join(' ')).toContain('Le Carnet Bleu')
    const unselected = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'start the game', sender, mentions })
    expect(unselected).toMatchObject({ ok: false })
    expect(unselected.messages.join(' ')).toContain('No game is selected')
    const selected = adapter.handle({ channel: 'whatsapp', conversationId: 'other', text: 'start the game', game: 'carnet bleu', sender, mentions })
    expect(selected).toMatchObject({ ok: true, gameId: 'le-carnet-bleu' })
  })

  it('returns precise installation and compatibility errors', () => {
    const absent = createOpenClawGameAdapter({ runtimes: [], store: createMemoryChatSessionStore(), capabilities })
    expect(absent.handle({ channel: 'whatsapp', conversationId: 'x', text: 'start the game', game: 'le-carnet-bleu', sender, mentions }).messages.join(' ')).toContain('not installed')
    const incompatible = createOpenClawGameAdapter({ runtimes: [createLeCarnetBleuRuntime()], store: createMemoryChatSessionStore(), capabilities: { ...capabilities, statePersistence: false } })
    expect(incompatible.handle({ channel: 'whatsapp', conversationId: 'x', text: 'start the game', game: 'le-carnet-bleu', sender, mentions }).messages.join(' ')).toContain('state_persistence')
  })
})
