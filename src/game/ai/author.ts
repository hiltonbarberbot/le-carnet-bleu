import { createGameDefinition } from '../definition/create'
import type { GameDefinition, GameDefinitionInput } from '../definition/contract'
import type { SettingBrief } from '../setting/contract'

type AuthoringResponse = {
  definition?: GameDefinitionInput
  error?: string
}

export async function draftGameFromSetting(setting: SettingBrief): Promise<GameDefinition> {
  const response = await fetch('/api/ai/author', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setting }),
  })
  const payload = await response.json() as AuthoringResponse
  if (!response.ok) throw new Error(payload.error || `AI authoring failed (${response.status}).`)
  if (!payload.definition) throw new Error('The AI author returned no game definition.')
  return createGameDefinition(payload.definition)
}
