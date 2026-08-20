import { NoObjectGeneratedError, Output, ToolLoopAgent } from 'ai'
import { productNaming } from '../../../product/naming'
import { createSettingBrief, getSettingBriefBlockers } from '../../setting/brief'
import type { SettingBriefInput } from '../../setting/contract'
import type { SettingConversationMessage } from '../setting/conversation'
import { normalizeSettingDraft } from '../setting/draft'
import { classifyAiProviderError, createProblemReference, problemResponse } from './problem'

const model = process.env.AI_GATEWAY_MODEL || 'google/gemini-3.7-flash'
const maxMessages = 30
const maxConversationCharacters = 24_000
export const maxDuration = 300

const settingShape = `Return exactly one JSON object with this shape:
{
  "message": "your short, natural reply to the host",
  "draft": {
    "venueName": "", "location": "", "era": "",
    "playableSpaces": [{ "id": "stable-space-id", "label": "", "description": "" }],
    "routes": [{ "id": "stable-route-id", "label": "", "description": "", "spaceIds": ["stable-space-id"], "accessibilityNotes": [] }],
    "usableFeatures": [{ "id": "stable-feature-id", "label": "", "description": "", "spaceIds": ["stable-space-id"] }],
    "availableProps": [{ "id": "stable-lowercase-slug", "label": "", "description": "", "quantity": 1, "safetyNotes": [] }],
    "tone": "",
    "safetyConstraints": [{ "id": "stable-constraint-id", "label": "", "description": "" }],
    "accessibilityNeeds": [{ "id": "stable-need-id", "label": "", "description": "" }],
    "contentBoundaries": [{ "id": "stable-boundary-id", "label": "", "description": "" }]
  }
}`

const settingAgent = new ToolLoopAgent({
  model,
  instructions: `You are a warm, concise setting concierge for a setting-aware live mystery authoring system.
Your job is to maintain a structured draft from the host's conversation and ask only for facts that are genuinely still needed.

Rules:
- Reuse every fact already supplied. Never make the host repeat known information.
- Never show a questionnaire, field list, JSON, validation errors, or internal workflow.
- Ask one compact conversational question at a time. You may group at most three closely related facts when that makes answering easier.
- Do not ask about a real-world occasion. The fictional gathering, invitation, plot, and reason characters are present are created later.
- Never invent rooms, routes, terraces, doors, lighting control, props, permissions, local history, mobility needs, privacy rules, safety constraints, content boundaries, tone, or era.
- Optional details may remain empty, but explicitly establish whether there are accessibility needs or available props when relevant.
- A usable setting needs the real venue, location, fictional era, at least two playable areas (or one area that can safely change function), safe routes, tone, safety constraints, and content boundaries.
- Physical activity must stay no-contact and host-cued.
- Keep the reply under 70 words. When the draft is complete, say you have enough to prepare a concise confirmation.
- Return the full accumulated draft on every turn, not only newly learned facts. Give named resources stable lowercase slug ids.

${settingShape}`,
  output: Output.json({
    name: 'setting_conversation_turn',
    description: 'A conversational reply and the complete accumulated real-world setting draft.',
  }),
  maxOutputTokens: 2200,
  temperature: 0.2,
  providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'setting-conversation'] } },
})

function isConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function cleanMessages(value: unknown): SettingConversationMessage[] {
  if (!Array.isArray(value)) return []
  const messages = value.slice(-maxMessages).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const message = item as Record<string, unknown>
    const role = message.role
    const content = typeof message.content === 'string' ? message.content.trim().slice(0, 4_000) : ''
    if ((role !== 'assistant' && role !== 'user') || !content) return []
    return [{ role, content } satisfies SettingConversationMessage]
  })
  let characters = 0
  return messages.reverse().filter(message => {
    if (characters + message.content.length > maxConversationCharacters) return false
    characters += message.content.length
    return true
  }).reverse()
}

function parseJsonObject(value: string) {
  const text = value.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? text) as unknown
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return problemResponse('invalid_request', { message: 'Cross-origin AI requests are not allowed.', status: 403 })
  if (!isConfigured()) return problemResponse('not_configured')

  let messages: SettingConversationMessage[] = []
  let currentDraft: SettingBriefInput = {}
  try {
    const body = await request.json() as { messages?: unknown; draft?: unknown }
    messages = cleanMessages(body.messages)
    currentDraft = normalizeSettingDraft(body.draft)
  } catch {
    return problemResponse('invalid_request', { message: 'Request body must be valid JSON.' })
  }
  if (!messages.length || messages.at(-1)?.role !== 'user') {
    return problemResponse('invalid_request', { message: 'The setting conversation needs a host message.' })
  }

  const transcript = messages.map(message => `${message.role === 'user' ? 'HOST' : 'SETTING AGENT'}: ${message.content}`).join('\n\n')
  const blockers = getSettingBriefBlockers(currentDraft)
  const reference = createProblemReference()

  try {
    const result = await settingAgent.generate({
      prompt: [
        `Current structured draft:\n${JSON.stringify(currentDraft)}`,
        blockers.length ? `Current validation gaps:\n${blockers.join('\n')}` : 'The current draft has no validation gaps.',
        `Conversation:\n${transcript}`,
        'Update the full draft from the conversation, then respond naturally with the single best next question or a brief completion message.',
      ].join('\n\n'),
    })
    const raw = result.output ?? parseJsonObject(result.text)
    const turn = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const draft = normalizeSettingDraft(turn.draft)
    const remaining = getSettingBriefBlockers(draft)
    const ready = remaining.length === 0
    if (ready) createSettingBrief(draft)
    const message = typeof turn.message === 'string' && turn.message.trim()
      ? turn.message.trim()
      : ready
        ? 'I have enough to prepare the setting for your confirmation.'
        : 'Tell me a little more about the real venue and how people can safely use it.'

    return Response.json({ message, draft, ready }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const code = NoObjectGeneratedError.isInstance(error) ? 'invalid_output' : classifyAiProviderError(error)
    console.error('AI setting conversation failed', { reference, code, error })
    return problemResponse(code, { reference })
  }
}
