import type { SettingBriefInput } from '../setting/contract'

type SettingDraftResponse = {
  setting?: SettingBriefInput
  error?: string
}

export async function createSettingFromSeed(prompt: string): Promise<SettingBriefInput> {
  const response = await fetch('/api/ai/setting', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const payload = await response.json() as SettingDraftResponse
  if (!response.ok) throw new Error(payload.error || `AI setting creation failed (${response.status}).`)
  if (!payload.setting) throw new Error('The AI returned no setting brief.')
  return payload.setting
}
