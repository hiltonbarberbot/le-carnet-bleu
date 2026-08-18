import type { GameState, RuntimeCapabilities } from '../types'
import type { SettingBrief } from '../setting/contract'

export type GameParticipant = {
  displayName: string
}

export type RuntimeContext = {
  capabilities: RuntimeCapabilities
  now?: Date
  createId?: () => string
}

export type CreateSessionRequest = {
  host: GameParticipant
  participants: GameParticipant[]
  allowAiFallback?: boolean
}

export type GameCommand = {
  name: string
  payload?: Record<string, unknown>
}

export type RuntimeEvent = {
  type: 'session_created' | 'state_changed' | 'error'
  message: string
}

export type RuntimeResult<State> = {
  state: State
  events: RuntimeEvent[]
}

export type GameCommandDescriptor = {
  name: string
  description: string
  allowedPhases: string[]
  payload: Record<string, string>
}

export type GameManifest = {
  id: string
  version: string
  name: string
  description: string
  aliases: string[]
  roles: {
    suspects: number
    hostRequired: boolean
  }
  requiredHostCapabilities: string[]
  optionalHostCapabilities: string[]
  authoring: {
    mode: 'setting_first'
    requiredBeforeStory: boolean
    instructions: string
    settingQuestions: Array<{
      id: string
      prompt: string
      required: boolean
    }>
    workflow: string[]
  }
  lifecycle: string[]
  commands: GameCommandDescriptor[]
}

export type PortableGameRuntime<State = GameState> = {
  manifest: GameManifest
  authoredGame: {
    setting: SettingBrief
    definitionId: string
    definitionFingerprint: string
    storyId: string
    storyTitle: string
  }
  createSession(request: CreateSessionRequest, context: RuntimeContext): RuntimeResult<State>
  handleInput(state: State, command: GameCommand, context: RuntimeContext): RuntimeResult<State>
  serializeState(state: State): string
  restoreState(serialized: string): State
}
