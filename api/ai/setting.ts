import { generateText, NoObjectGeneratedError, Output } from 'ai'
import { createSettingBrief } from '../../src/game/setting/brief.js'
import type { SettingBriefInput } from '../../src/game/setting/contract.js'
import { productNaming } from '../../src/product/naming.js'
import { classifyAiProviderError, createProblemReference, problemResponse } from './problem.js'

const model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-4.6'
const maxSettingGenerations = 4
export const maxDuration = 300

function isConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
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

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : []
}

function cleanProps(value: unknown): NonNullable<SettingBriefInput['availableProps']> {
  if (!Array.isArray(value)) return []
  const result: NonNullable<SettingBriefInput['availableProps']> = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim())
      continue
    }
    if (!item || typeof item !== 'object') continue
    const prop = item as Record<string, unknown>
    const label = cleanText(prop.label)
    if (!label) continue
    result.push({
      id: cleanText(prop.id) || undefined,
      label,
      description: cleanText(prop.description),
      quantity: typeof prop.quantity === 'number' ? prop.quantity : 1,
      safetyNotes: cleanList(prop.safetyNotes),
    })
  }
  return result
}

function cleanResources(value: unknown): NonNullable<SettingBriefInput['playableSpaces']> {
  if (!Array.isArray(value)) return []
  const result: NonNullable<SettingBriefInput['playableSpaces']> = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim())
      continue
    }
    if (!item || typeof item !== 'object') continue
    const resource = item as Record<string, unknown>
    const label = cleanText(resource.label)
    if (label) result.push({ id: cleanText(resource.id) || undefined, label, description: cleanText(resource.description) })
  }
  return result
}

function resourceLabel(item: NonNullable<SettingBriefInput['playableSpaces']>[number]) {
  return typeof item === 'string' ? item : item.label
}

function parseJsonObject(value: string) {
  const text = value.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? text) as unknown
}

function rejectedDraftFrom(error: unknown) {
  if (NoObjectGeneratedError.isInstance(error)) return cleanText(error.text)
  return ''
}

function invalidOutputReason(error: unknown) {
  if (NoObjectGeneratedError.isInstance(error) && error.cause instanceof Error) return error.cause.message
  return error instanceof Error ? error.message : String(error)
}

function cleanSetting(value: unknown): SettingBriefInput {
  const setting = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    venueName: cleanText(setting.venueName),
    location: cleanText(setting.location),
    era: cleanText(setting.era),
    playableSpaces: cleanResources(setting.playableSpaces),
    routes: cleanResources(setting.routes),
    usableFeatures: cleanResources(setting.usableFeatures),
    availableProps: cleanProps(setting.availableProps),
    tone: cleanText(setting.tone),
    safetyConstraints: cleanResources(setting.safetyConstraints),
    accessibilityNeeds: cleanResources(setting.accessibilityNeeds),
    contentBoundaries: cleanResources(setting.contentBoundaries),
  }
}

function completeSettingDraft(setting: SettingBriefInput): SettingBriefInput {
  const spaces = cleanResources(setting.playableSpaces)
  const playableSpaces = spaces.length === 0
    ? ['Main host-approved gathering area', 'Clue station within the same gathering area']
    : spaces.length === 1
      ? [spaces[0], `Clue station within ${resourceLabel(spaces[0])}`]
      : spaces

  return {
    ...setting,
    venueName: cleanText(setting.venueName) || "Host's venue",
    location: cleanText(setting.location) || 'Location unspecified; do not use local details',
    era: cleanText(setting.era) || 'Present day',
    playableSpaces,
    routes: cleanResources(setting.routes).length
      ? cleanResources(setting.routes)
      : ['Both play zones remain within the same host-approved gathering area; no relocation is required'],
    tone: cleanText(setting.tone) || 'Elegant, playful suspense',
    safetyConstraints: cleanResources(setting.safetyConstraints).length
      ? cleanResources(setting.safetyConstraints)
      : ['No physical contact', 'No running or darkness', 'All physical staging is optional and host-cued'],
    accessibilityNeeds: cleanResources(setting.accessibilityNeeds).length
      ? cleanResources(setting.accessibilityNeeds)
      : ['All essential play works seated and without movement'],
    contentBoundaries: cleanResources(setting.contentBoundaries).length
      ? cleanResources(setting.contentBoundaries)
      : ['Keep violence non-graphic', 'No sexual violence or harm to children', 'Do not use real personal or family secrets'],
  }
}

const settingShape = `Return exactly one JSON object with this shape:
{
  "venueName": "", "location": "", "era": "",
  "playableSpaces": [{ "id": "stable-space-id", "label": "", "description": "" }],
  "routes": [{ "id": "stable-route-id", "label": "", "description": "", "spaceIds": ["stable-space-id"], "accessibilityNotes": [] }],
  "usableFeatures": [{ "id": "stable-feature-id", "label": "", "description": "", "spaceIds": ["stable-space-id"] }],
  "availableProps": [{ "id": "stable-lowercase-slug", "label": "", "description": "", "quantity": 1, "safetyNotes": [] }],
  "tone": "", "safetyConstraints": [{ "id": "stable-constraint-id", "label": "", "description": "" }], "accessibilityNeeds": [{ "id": "stable-need-id", "label": "", "description": "" }], "contentBoundaries": [{ "id": "stable-boundary-id", "label": "", "description": "" }]
}`

type SettingRepair = {
  reason: string
  rejectedDraft: string
}

function repairInstruction(repair: SettingRepair) {
  return [
    'The prior draft was rejected. Return a fresh, complete JSON object that fixes every issue.',
    `Validation or parsing error:\n${repair.reason}`,
    repair.rejectedDraft ? `Rejected draft:\n${repair.rejectedDraft.slice(0, 6_000)}` : '',
  ].filter(Boolean).join('\n\n')
}

function conservativeSetting() {
  return createSettingBrief(completeSettingDraft({}))
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return problemResponse('invalid_request', { message: 'Cross-origin AI requests are not allowed.', status: 403 })
  if (!isConfigured()) return problemResponse('not_configured')

  let prompt = ''
  try {
    const body = await request.json() as { prompt?: unknown }
    prompt = cleanText(body.prompt)
  } catch {
    return problemResponse('invalid_request', { message: 'Request body must be valid JSON.' })
  }
  if (!prompt) return problemResponse('invalid_request', { message: 'A description of the evening is required.' })
  if (prompt.length > 10_000) return problemResponse('invalid_request', { message: 'Keep the opening description under 10,000 characters.' })

  const reference = createProblemReference()
  let repair: SettingRepair | undefined
  for (let attempt = 0; attempt < maxSettingGenerations; attempt += 1) {
    let output: unknown
    try {
      const result = await generateText({
        model,
        system: `You turn a tiny seed into a complete, conservative setting brief for a live mystery.
Use every fact the host supplied about the real place and play constraints. Fill every missing required field so the host never has to complete a form.
Do not invent the fictional gathering, invitation, plot, or reason the characters are present. Those belong to story generation, not the real setting brief.
Do not invent specific architecture, local history, permissions, or objects. When the seed omits venue facts, use honest neutral language such as "host's venue", "main host-approved gathering area", and "location unspecified; do not use local details".
There must be at least two playable areas. If only one real room is known, define two functional zones within it and state that no relocation is required.
Default to present day unless the seed implies another era. Supply safe defaults: no contact, running, darkness, inaccessible required movement, or graphic violence; all physical staging is optional and host-cued. Keep inferred features and props generic, easy, and removable. Give every prop a stable unique id, positive quantity, description, and any object-specific safety notes. Return only the requested JSON.`,
        prompt: [settingShape, `Mystery seed:\n${prompt}`, repair ? repairInstruction(repair) : 'Complete the setting brief now.'].join('\n\n'),
        output: Output.json({ name: 'setting_brief', description: 'A complete, safe setting brief for a live mystery.' }),
        maxOutputTokens: 1800,
        temperature: 0.2,
        providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'setting-seeding'] } },
      })
      output = result.output ?? parseJsonObject(result.text)
    } catch (error) {
      const code = classifyAiProviderError(error)
      if (code === 'invalid_output') {
        repair = {
          reason: invalidOutputReason(error),
          rejectedDraft: rejectedDraftFrom(error),
        }
        continue
      }
      console.error('AI setting provider request failed', { reference, code, error })
      return problemResponse(code, { reference })
    }

    try {
      const setting = createSettingBrief(completeSettingDraft(cleanSetting(output)))
      return json({ setting, model })
    } catch (error) {
      repair = {
        reason: error instanceof Error ? error.message : String(error),
        rejectedDraft: JSON.stringify(output),
      }
    }
  }

  console.warn('AI setting seeding exhausted repair attempts; using conservative validated setting', {
    reference,
    error: repair?.reason,
  })
  return json({ setting: conservativeSetting(), model })
}
