import type { StorylineDefinition } from '../definition/contract'

export type AiGatewayStatus = {
  available: boolean
  model?: string
}

export type AiPerformanceRequest = {
  definition: StorylineDefinition
  sessionId: string
  roleId: string
  actionId: string
}

function apiError(status: number, payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error
  }
  return `AI Gateway request failed (${status}).`
}

export async function readAiGatewayStatus(signal?: AbortSignal): Promise<AiGatewayStatus> {
  const response = await fetch('/api/ai/perform', { signal })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(apiError(response.status, payload))
  if (!payload || typeof payload !== 'object' || !('available' in payload) || typeof payload.available !== 'boolean') {
    throw new Error('AI Gateway returned an invalid status response.')
  }
  return payload as AiGatewayStatus
}

export async function generateAiPerformance(input: AiPerformanceRequest): Promise<string> {
  const response = await fetch('/api/ai/perform', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(apiError(response.status, payload))
  if (!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string') {
    throw new Error('AI Gateway returned an invalid performance response.')
  }
  return payload.text
}
