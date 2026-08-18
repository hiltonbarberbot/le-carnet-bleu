import { generateText } from 'ai'
import { createSettingBrief } from '../../src/game/setting/brief.js'
import type { SettingBriefInput } from '../../src/game/setting/contract.js'
import { productNaming } from '../../src/product/naming.js'

const model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-4.6'
export const maxDuration = 60

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

function parseJsonObject(value: string) {
  const text = value.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? text) as unknown
}

function cleanSetting(value: unknown): SettingBriefInput {
  const setting = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    venueName: cleanText(setting.venueName),
    location: cleanText(setting.location),
    occasion: cleanText(setting.occasion),
    era: cleanText(setting.era),
    playableSpaces: cleanList(setting.playableSpaces),
    routes: cleanList(setting.routes),
    usableFeatures: cleanList(setting.usableFeatures),
    availableProps: cleanList(setting.availableProps),
    tone: cleanText(setting.tone),
    safetyConstraints: cleanList(setting.safetyConstraints),
    accessibilityNeeds: cleanList(setting.accessibilityNeeds),
    contentBoundaries: cleanList(setting.contentBoundaries),
  }
}

const settingShape = `Return exactly one JSON object with this shape:
{
  "venueName": "", "location": "", "occasion": "", "era": "",
  "playableSpaces": [], "routes": [], "usableFeatures": [], "availableProps": [],
  "tone": "", "safetyConstraints": [], "accessibilityNeeds": [], "contentBoundaries": []
}`

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Cross-origin AI requests are not allowed.' }, 403)
  if (!isConfigured()) return json({ error: 'AI setting extraction is not configured.' }, 503)

  let prompt = ''
  try {
    const body = await request.json() as { prompt?: unknown }
    prompt = cleanText(body.prompt)
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!prompt) return json({ error: 'A description of the evening is required.' }, 400)
  if (prompt.length > 10_000) return json({ error: 'Keep the opening description under 10,000 characters.' }, 400)

  let lastError = 'The generated setting was incomplete.'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model,
        system: `You turn a tiny seed into a complete, conservative setting brief for a live mystery.
Use every fact the host supplied. Fill every missing required field so the host never has to complete a form.
Do not invent specific architecture, local history, permissions, or objects. When the seed omits venue facts, use honest neutral language such as "host's venue", "main host-approved gathering area", and "location unspecified; do not use local details".
There must be at least two playable areas. If only one real room is known, define two functional zones within it and state that no relocation is required.
Default to present day unless the seed implies another era. Supply safe defaults: no contact, running, darkness, inaccessible essential movement, or graphic violence; all physical beats are optional and host-cued. Keep inferred features and props generic, easy, and removable. Return only the requested JSON.`,
        prompt: [settingShape, `Mystery seed:\n${prompt}`, attempt ? `The prior setting was invalid. Correct these issues:\n${lastError}` : 'Complete the setting brief now.'].join('\n\n'),
        maxOutputTokens: 1800,
        temperature: 0.2,
        providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'setting-seeding'] } },
      })
      const setting = createSettingBrief(cleanSetting(parseJsonObject(result.text)))
      return json({ setting, model })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  console.error('AI setting seeding failed validation', lastError)
  return json({ error: 'We could not turn that seed into a safe playable setting. Please try again.' }, 502)
}
