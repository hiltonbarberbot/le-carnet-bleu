import { createStorylineDefinition } from '../definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../definition/contract'
import type { SettingBrief } from '../setting/contract'
import { AiRequestError, requestAiJson } from './problem'

type AuthoringResponse = {
  definition?: StorylineDefinitionInput
  error?: string
}

export async function draftStorylineFromSetting(setting: SettingBrief): Promise<StorylineDefinition> {
  const payload = await requestAiJson<AuthoringResponse>('/api/ai/author', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setting }),
  })
  if (!payload || typeof payload !== 'object' || !payload.definition) {
    throw new AiRequestError({
      error: 'The drafting service returned no story definition.',
      code: 'bad_response',
      retryable: true,
    })
  }
  try {
    return createStorylineDefinition(payload.definition)
  } catch {
    throw new AiRequestError({
      error: 'The returned story did not pass the local game checks.',
      code: 'invalid_output',
      retryable: true,
    })
  }
}

/** @deprecated Use draftStorylineFromSetting. */
export const draftGameFromSetting = draftStorylineFromSetting
