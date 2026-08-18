import { generateText, Output } from 'ai'
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

  try {
    const result = await generateText({
      model,
      system: 'You extract a factual venue brief for a live mystery. Copy or concisely restate only facts the host explicitly supplied. Never invent, assume, or fill gaps. Unknown strings stay empty and unknown lists stay empty.',
      prompt: `${settingShape}\n\nHost notes:\n${prompt}`,
      output: Output.json({ name: 'setting_notes', description: 'Only setting facts explicitly present in the host notes.' }),
      maxOutputTokens: 1500,
      temperature: 0,
      providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'setting-extraction'] } },
    })
    return json({ setting: cleanSetting(result.output), model })
  } catch (error) {
    console.error('AI setting extraction failed', error)
    return json({ error: 'We could not shape those notes just now. Please try again.' }, 502)
  }
}
