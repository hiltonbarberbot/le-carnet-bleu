import type { GameState } from '../types'
import type { SettingBrief } from '../setting/contract'
import type {
  GameCommand,
  GameCommandContext,
  GameCommandDescriptor,
  GameEvent,
} from '../application/commands'

export type { GameCommand, GameCommandDescriptor } from '../application/commands'
export type { RuntimeCapabilities } from '../types'

export type GameParticipant = {
  id?: string
  displayName: string
}

export type RuntimeContext = GameCommandContext

export type CreateSessionRequest = {
  host: GameParticipant
  participants: GameParticipant[]
  allowAiFallback?: boolean
}

export type RuntimeEvent = GameEvent

export type RuntimeResult<State> = {
  state: State
  events: RuntimeEvent[]
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
  storyline: {
    setting: SettingBrief
    id: string
    fingerprint: string
    storyId: string
    title: string
  }
  createSession(request: CreateSessionRequest, context: RuntimeContext): RuntimeResult<State>
  handleInput(state: State, command: GameCommand, context: RuntimeContext): RuntimeResult<State>
  serializeState(state: State): string
  restoreState(serialized: string): State
}
