import { discoverGames, resolveGame } from '../../game/runtime/registry'
import type { GameCommand, GameParticipant, PortableGameRuntime } from '../../game/runtime/contract'
import type { GameState, RuntimeCapabilities } from '../../game/types'

export type OpenClawCapabilities = RuntimeCapabilities & {
  statePersistence: boolean
  privateMessaging: boolean
}

export type ChatParticipant = {
  id: string
  displayName: string
  privateAddress?: string
}

export type ChatRequest = {
  channel: string
  conversationId: string
  text: string
  sender: ChatParticipant
  mentions?: ChatParticipant[]
  game?: string
  command?: GameCommand
}

export type ChatResponse = {
  ok: boolean
  messages: string[]
  gameId?: string
  sessionId?: string
  state?: GameState
}

export type PersistedChatSession = {
  gameId: string
  definitionId: string
  definitionFingerprint: string
  serializedState: string
}

export type ChatSessionStore = {
  load(key: string): PersistedChatSession | null
  save(key: string, session: PersistedChatSession): void
}

export type GameBinding = {
  channel: string
  conversationId: string
  gameId: string
}

export type OpenClawAdapterOptions = {
  runtimes: PortableGameRuntime[]
  store: ChatSessionStore
  bindings?: GameBinding[]
  capabilities: OpenClawCapabilities
  now?: () => Date
  createId?: () => string
}

function conversationKey(request: Pick<ChatRequest, 'channel' | 'conversationId'>) {
  return `${request.channel}:${request.conversationId}`
}

function participantAddress(channel: string, participant: ChatParticipant) {
  return participant.privateAddress?.trim() || `${channel}:${participant.id}`
}

function uniqueParticipants(channel: string, participants: ChatParticipant[]): GameParticipant[] {
  const ids = new Set<string>()
  const addresses = new Set<string>()
  return participants.map(participant => {
    const id = participant.id.trim()
    const displayName = participant.displayName.trim()
    const privateAddress = participantAddress(channel, participant)
    if (!id || !displayName) throw new Error('Every mentioned participant needs a stable id and display name.')
    if (ids.has(id)) throw new Error(`Participant ${displayName} was mentioned more than once.`)
    if (addresses.has(privateAddress)) throw new Error(`Participant ${displayName} does not have a distinct private address.`)
    ids.add(id)
    addresses.add(privateAddress)
    return { id, displayName, privateAddress }
  })
}

function capabilityErrors(runtime: PortableGameRuntime, capabilities: OpenClawCapabilities) {
  const available = new Set([
    ...(capabilities.statePersistence ? ['state_persistence'] : []),
    ...(capabilities.privateMessaging ? ['private_messaging'] : []),
    ...(capabilities.aiControllers ? ['ai_controllers'] : []),
  ])
  return runtime.manifest.requiredHostCapabilities.filter(capability => !available.has(capability))
}

function phaseOf(state: unknown) {
  return typeof state === 'object' && state !== null && 'phase' in state ? String(state.phase) : 'unknown'
}

export function createMemoryChatSessionStore(): ChatSessionStore {
  const sessions = new Map<string, PersistedChatSession>()
  return {
    load: key => sessions.get(key) ?? null,
    save: (key, session) => { sessions.set(key, session) },
  }
}

export function createOpenClawGameAdapter(options: OpenClawAdapterOptions) {
  const installed = discoverGames(options.runtimes)

  function listGames() {
    return installed.map(({ manifest, runtime }) => `${runtime.authoredGame.storyTitle} (${runtime.authoredGame.definitionId}) · ${runtime.authoredGame.setting.venueName} · ${manifest.players.minHumans}–${manifest.players.maxHumans} human guests`).join('\n')
  }

  function bindingFor(request: ChatRequest) {
    return options.bindings?.find(binding => binding.channel === request.channel && binding.conversationId === request.conversationId)?.gameId
  }

  function runtimeForPersisted(session: PersistedChatSession) {
    const runtime = options.runtimes.find(candidate => candidate.authoredGame.definitionFingerprint === session.definitionFingerprint)
    if (!runtime) throw new Error(`Game definition ${session.definitionId} is stored for this conversation but is not installed.`)
    return runtime
  }

  function persist(key: string, gameId: string, runtime: PortableGameRuntime, state: GameState) {
    options.store.save(key, {
      gameId,
      definitionId: runtime.authoredGame.definitionId,
      definitionFingerprint: runtime.authoredGame.definitionFingerprint,
      serializedState: runtime.serializeState(state),
    })
  }

  function handle(request: ChatRequest): ChatResponse {
    try {
      const key = conversationKey(request)
      const persisted = options.store.load(key)
      const asksToList = /\b(which|what|list|available)\s+games?\b/i.test(request.text)
      if (asksToList) return { ok: true, messages: [installed.length ? listGames() : 'No portable games are installed.'] }

      if (persisted) {
        const runtime = runtimeForPersisted(persisted)
        const state = runtime.restoreState(persisted.serializedState) as GameState
        if (!request.command) {
          return {
            ok: true,
            gameId: runtime.manifest.id,
            sessionId: state.phase === 'idle' ? undefined : state.id,
            state,
            messages: [`${runtime.manifest.name} is ${phaseOf(state)}. Send one of: ${runtime.manifest.commands.filter(command => command.allowedPhases.includes(phaseOf(state))).map(command => command.name).join(', ') || 'no commands'}.`],
          }
        }
        const result = runtime.handleInput(state, request.command, {
          capabilities: options.capabilities,
          now: options.now?.(),
          createId: options.createId,
        })
        persist(key, runtime.manifest.id, runtime, result.state as GameState)
        return {
          ok: true,
          gameId: runtime.manifest.id,
          sessionId: result.state.phase === 'idle' ? undefined : result.state.id,
          state: result.state as GameState,
          messages: result.events.map(event => event.message),
        }
      }

      const asksToStart = /\b(run|start|play|do)\b.*\b(game|run)\b/i.test(request.text)
      if (!asksToStart && !request.command) {
        return { ok: false, messages: [`No game session exists here. Available games:\n${listGames() || 'none'}`] }
      }

      const selector = request.game || bindingFor(request)
      if (!selector) {
        return { ok: false, messages: [`No game is selected for ${key}. Choose one of:\n${listGames() || 'none installed'}`] }
      }
      const runtime = resolveGame(options.runtimes, selector)
      if (!runtime) {
        const wanted = selector.trim().toLowerCase()
        const variants = options.runtimes.filter(candidate => candidate.manifest.id.toLowerCase() === wanted
          || candidate.manifest.name.toLowerCase() === wanted
          || candidate.manifest.aliases.some(alias => alias.toLowerCase() === wanted))
        return variants.length > 1
          ? { ok: false, messages: [`More than one authored definition matches “${selector}”. Select its definition id:\n${variants.map(candidate => `- ${candidate.authoredGame.definitionId} · ${candidate.authoredGame.setting.venueName}`).join('\n')}`] }
          : { ok: false, messages: [`Game “${selector}” is not installed. Available games:\n${listGames() || 'none'}`] }
      }
      const missing = capabilityErrors(runtime, options.capabilities)
      if (missing.length) return { ok: false, gameId: runtime.manifest.id, messages: [`${runtime.manifest.name} is incompatible with this OpenClaw host. Missing: ${missing.join(', ')}.`] }

      const participants = uniqueParticipants(request.channel, request.mentions ?? [])
      const result = runtime.createSession({
        host: {
          id: request.sender.id,
          displayName: request.sender.displayName,
          privateAddress: participantAddress(request.channel, request.sender),
        },
        participants,
        allowAiFallback: options.capabilities.aiControllers,
      }, {
        capabilities: options.capabilities,
        now: options.now?.(),
        createId: options.createId,
      })
      persist(key, runtime.manifest.id, runtime, result.state as GameState)
      return {
        ok: true,
        gameId: runtime.manifest.id,
        sessionId: result.state.phase === 'idle' ? undefined : result.state.id,
        state: result.state as GameState,
        messages: [
          ...result.events.map(event => event.message),
          `Human participants retained separately: ${participants.map(participant => participant.displayName).join(', ')}.`,
          `The game is enrolling; AI fallback, if allowed, is not assigned until prepare.`,
        ],
      }
    } catch (error) {
      return { ok: false, messages: [error instanceof Error ? error.message : String(error)] }
    }
  }

  return { listGames: () => installed.map(game => game.manifest), handle }
}
