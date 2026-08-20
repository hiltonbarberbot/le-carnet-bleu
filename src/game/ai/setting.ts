import type { SettingBriefInput } from '../setting/contract'
import { AiRequestError, requestAiJson } from './problem'

type SettingDraftResponse = {
  draft?: SettingBriefInput
  error?: string
}

export async function createSettingFromSeed(prompt: string): Promise<SettingBriefInput> {
  const payload = await requestAiJson<SettingDraftResponse>('/api/ai/setting', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!payload || typeof payload !== 'object' || !payload.draft) {
    throw new AiRequestError({
      error: 'The drafting service returned no setting brief.',
      code: 'bad_response',
      retryable: true,
    })
  }
  return payload.draft
}
