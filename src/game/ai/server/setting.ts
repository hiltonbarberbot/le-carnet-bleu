import { generateText, NoObjectGeneratedError, Output } from 'ai'
import { productNaming } from '../../../product/naming'
import { normalizeSettingDraft } from '../setting/draft'
import { classifyAiProviderError, createProblemReference, problemResponse } from './problem'

const model = process.env.AI_GATEWAY_MODEL || 'google/gemini-3.7-flash'
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
    'The prior extraction was malformed. Return a fresh JSON object in the requested shape.',
    `Validation or parsing error:\n${repair.reason}`,
    repair.rejectedDraft ? `Rejected draft:\n${repair.rejectedDraft.slice(0, 6_000)}` : '',
  ].filter(Boolean).join('\n\n')
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
        system: `You extract real-world venue facts from a host's seed for a live mystery setting questionnaire.
Use every fact the host supplied about the real place and play constraints. Leave every unknown string empty and every unknown list empty so the host can answer it.
Do not invent the fictional gathering, invitation, plot, or reason the characters are present. Those belong to story generation, not the real setting brief.
Do not invent architecture, functional zones, routes, local history, permissions, objects, safety rules, accessibility needs, content boundaries, era, or tone. Do not add safe defaults. Paraphrase only facts actually present in the seed. Give explicitly named resources stable ids. Return only the requested JSON.`,
        prompt: [settingShape, `Mystery seed:\n${prompt}`, repair ? repairInstruction(repair) : 'Extract only the supplied setting facts now.'].join('\n\n'),
        output: Output.json({ name: 'setting_fact_extraction', description: 'Only real-world setting facts explicitly supplied by the host.' }),
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

    return json({ draft: normalizeSettingDraft(output), model })
  }

  console.error('AI setting extraction exhausted repair attempts', {
    reference,
    error: repair?.reason,
  })
  return problemResponse('invalid_output', {
    message: 'The setting facts could not be extracted. No venue details were assumed.',
    reference,
  })
}
