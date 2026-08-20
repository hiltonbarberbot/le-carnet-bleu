import type { SettingBriefInput } from '../../setting/contract'
import { AiRequestError, requestAiJson } from '../problem'

export type SettingConversationMessage = {
  role: 'assistant' | 'user'
  content: string
}

export type SettingConversationTurn = {
  message: string
  draft: SettingBriefInput
  ready: boolean
}

export const settingConversationOpening: SettingConversationMessage = {
  role: 'assistant',
  content: 'Tell me about the real place where you want to play and anything you already know about the mood or era. Rough notes are perfect — I’ll work out what else I need.',
}

export async function continueSettingConversation(
  messages: SettingConversationMessage[],
  draft: SettingBriefInput,
): Promise<SettingConversationTurn> {
  const payload = await requestAiJson<Partial<SettingConversationTurn>>('/api/ai/setting/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, draft }),
  })
  if (!payload || typeof payload !== 'object' || !payload.message || !payload.draft) {
    throw new AiRequestError({
      error: 'The setting agent returned an incomplete response.',
      code: 'bad_response',
      retryable: true,
    })
  }
  return { message: payload.message, draft: payload.draft, ready: payload.ready === true }
}
