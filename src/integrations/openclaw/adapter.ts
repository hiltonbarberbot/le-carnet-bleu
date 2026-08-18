import { discoverGames, findMatchingGames } from '../../game/runtime/registry'
import type { GameCommand, GameParticipant, PortableGameRuntime } from '../../game/runtime/contract'
import type { GameState, RuntimeCapabilities } from '../../game/types'

export type OpenClawCapabilities = RuntimeCapabilities & {
  statePersistence: boolean
  privateMessaging: boolean
}

export type ChatParticipant = {
  id: string
  displayName: string
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

function mentionedParticipants(participants: ChatParticipant[]): GameParticipant[] {
  return participants.map(participant => {
    const id = participant.id.trim()
    const displayName = participant.displayName.trim()
    if (!id || !displayName) throw new Error('Every mentioned participant needs a stable id and display name.')
    return { displayName }
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
    return installed.map(({ manifest, runtime }) => `${manifest.name}: ${runtime.authoredGame.storyTitle} (${runtime.authoredGame.definitionId}) · ${runtime.authoredGame.setting.venueName} · ${manifest.roles.suspects} assignable suspect roles`).join('\n')
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
        const state = runtime.restoreState(persisted.serializedState)
        if (!request.command) {
          const phase = state.phase
          return {
            ok: true,
            gameId: runtime.manifest.id,
            sessionId: state.phase === 'idle' ? undefined : state.id,
            state,
            messages: [`${runtime.manifest.name} is ${phase}. Send one of: ${runtime.manifest.commands.filter(command => command.allowedPhases.includes(phase)).map(command => command.name).join(', ') || 'no commands'}.`],
          }
        }
        const result = runtime.handleInput(state, request.command, {
          capabilities: options.capabilities,
          now: options.now?.(),
          createId: options.createId,
        })
        persist(key, runtime.manifest.id, runtime, result.state)
        return {
          ok: true,
          gameId: runtime.manifest.id,
          sessionId: result.state.phase === 'idle' ? undefined : result.state.id,
          state: result.state,
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
      const variants = findMatchingGames(options.runtimes, selector)
      const runtime = variants.length === 1 ? variants[0] : null
      if (!runtime) {
        return variants.length > 1
          ? { ok: false, messages: [`More than one authored definition matches “${selector}”. Select its definition id:\n${variants.map(candidate => `- ${candidate.authoredGame.definitionId} · ${candidate.authoredGame.setting.venueName}`).join('\n')}`] }
          : { ok: false, messages: [`Game “${selector}” is not installed. Available games:\n${listGames() || 'none'}`] }
      }
      const missing = capabilityErrors(runtime, options.capabilities)
      if (missing.length) return { ok: false, gameId: runtime.manifest.id, messages: [`${runtime.manifest.name} is incompatible with this OpenClaw host. Missing: ${missing.join(', ')}.`] }

      const participants = mentionedParticipants(request.mentions ?? [])
      const result = runtime.createSession({
        host: {
          displayName: request.sender.displayName,
        },
        participants,
        allowAiFallback: options.capabilities.aiControllers,
      }, {
        capabilities: options.capabilities,
        now: options.now?.(),
        createId: options.createId,
      })
      persist(key, runtime.manifest.id, runtime, result.state)
      return {
        ok: true,
        gameId: runtime.manifest.id,
        sessionId: result.state.phase === 'idle' ? undefined : result.state.id,
        state: result.state,
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
