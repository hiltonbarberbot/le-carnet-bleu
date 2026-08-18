import { generateText, Output } from 'ai'
import { createGameDefinition } from '../../src/game/definition/create.js'
import type { GameDefinitionInput } from '../../src/game/definition/contract.js'
import { createSettingBrief } from '../../src/game/setting/brief.js'
import type { SettingBriefInput } from '../../src/game/setting/contract.js'
import { productNaming } from '../../src/product/naming.js'
import { createStoryAuthoringBrief } from '../../src/game/story/authoring.js'

const model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-4.6'
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

function readSetting(value: unknown): SettingBriefInput | null {
  if (!value || typeof value !== 'object' || !('setting' in value)) return null
  const setting = (value as { setting?: unknown }).setting
  return setting && typeof setting === 'object' ? setting as SettingBriefInput : null
}

const shape = `Return one JSON object with exactly this shape (never include fingerprint or schemaVersion):
{
  "id": "lowercase-slug", "title": "Story title",
  "setting": { "venueName": "", "location": "", "occasion": "", "era": "", "playableSpaces": [""], "routes": [""], "usableFeatures": [""], "availableProps": [""], "tone": "", "safetyConstraints": [""], "accessibilityNeeds": [""], "contentBoundaries": [""] },
  "story": {
    "id": "lowercase-slug", "seed": "lowercase-slug", "title": "", "subtitle": "", "premise": "", "totalPeople": 6, "hostRole": "", "victim": "", "culprit": "exact name of one character",
    "characters": [{ "id": "unique-slug", "name": "", "title": "", "costume": "", "publicFace": "", "invitationPretext": "", "invitationPromise": "", "privateIdentity": "", "privateObjective": "", "privateSecret": "", "traits": ["", ""], "objectives": [{ "id": "unique-id", "title": "", "text": "", "phase": "declared-act-id|investigation|any", "points": 1 }], "relationships": [{ "roleId": "another-character-id", "text": "" }], "secrets": [{ "id": "unique-id", "text": "", "kind": "evidence|secret|colour", "aboutRoleIds": ["another-character-id"], "beat": 1, "availableAfter": "optional-earlier-run-beat-id" }], "actions": [{ "id": "unique-id", "text": "", "cue": "", "consequence": "", "essential": true, "beat": 1, "phase": "declared-act-id", "physical": false, "requires": [] }] }],
    "publicEvidence": [{ "id": "unique-id", "text": "", "beat": 1 }],
    "evening": [{ "id": "stage-id", "title": "", "description": "what everyone does", "durationMinutes": 90, "phase": "single-opening-act-id|investigation|reveal" }],
    "timeline": [{ "beat": 1, "title": "", "truth": "", "evidence": ["existing-evidence-id-1", "existing-evidence-id-2"] }],
    "runPlan": [{ "id": "unique-id", "phase": "declared-act-id", "title": "", "trigger": "", "operator": "", "actionIds": ["existing-action-id"], "dependsOn": ["only-earlier-run-beat-id"], "essential": true }],
    "solution": ""
  },
  "clueDecks": [{ "id": "deck-id", "label": "setting-specific source", "settingField": "playableSpaces|routes|usableFeatures|availableProps|safetyConstraints|accessibilityNeeds", "settingValue": "an exact string copied from that setting array", "clues": [{ "id": "unique-clue-id", "text": "", "beat": 1 }] }],
  "acts": [{ "id": "opening-id", "title": "", "operatorGoal": "stage the incident, then become Game Master", "playerGoal": "follow the cold-open cues until the body is discovered", "durationMinutes": 10, "completionLabel": "Open the investigation" }],
  "setupRequirements": [{ "id": "requirement-id", "label": "", "settingField": "playableSpaces|routes|usableFeatures|availableProps|safetyConstraints|accessibilityNeeds", "settingValue": "an exact string copied from that setting array" }]
}

Hard structural rules: exactly five characters; every character has at least two playable traits, exactly three 1-3 point objectives, a variable non-empty relationship list, truthful secrets about other suspects, and at least one action; the union of relationships and secret targets must connect all five characters, and every character must both know and be the subject of another suspect's secret; create exactly one authored opening act lasting no more than fifteen minutes; every authored action and run-plan beat belongs to that opening; the opening introduces the cast, stages the only in-game death, reveals the body, and hands control to the players; after it, include exactly one continuous 60-180 minute investigation stage with no scripted acts, where players talk, bargain, buy clues, pursue objectives, and may call a public accusation at any time; no later event removes a player from play; create exactly two setting-backed clue decks containing exactly five clues total; purchasable clues can corroborate timeline claims, but every timeline beat still cites at least two non-purchasable evidence IDs; every essential action has a canonical beat and appears in a runPlan actionIds list; timeline beat numbers are contiguous from 1; the opening has operator and player goals and an essential run-plan beat; dependencies only point backward; every physical action has at least one valid setup requirement ID. Copy the validated setting exactly.`

export function GET() {
  const available = isConfigured()
  return json({ available, model: available ? model : undefined })
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Cross-origin AI requests are not allowed.' }, 403)
  if (!isConfigured()) return json({ error: 'AI story drafting is not configured.' }, 503)

  let settingInput: SettingBriefInput | null = null
  try {
    settingInput = readSetting(await request.json())
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!settingInput) return json({ error: 'A setting brief is required.' }, 400)

  let setting
  try {
    setting = createSettingBrief(settingInput)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'The setting brief is incomplete.' }, 400)
  }

  const authoringBrief = createStoryAuthoringBrief(setting)
  let lastError = 'The generated story was invalid.'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateText({
        model,
        system: 'You are a meticulous live-mystery designer. Return only the requested structured JSON. Build a playable, fair mystery from the verified setting; never reuse Maison Bleue demo canon.',
        prompt: [authoringBrief, shape, attempt ? `A prior draft failed validation. Correct these issues in a fresh complete draft:\n${lastError}` : 'Draft the complete game now.'].join('\n\n'),
        output: Output.json({ name: 'setting_specific_game_definition', description: `A complete validated ${productNaming.name} game definition.` }),
        maxOutputTokens: 12000,
        temperature: 0.7,
        providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'story-authoring'] } },
      })
      const definition = createGameDefinition(result.output as unknown as GameDefinitionInput)
      return json({ definition, model })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  console.error('AI story authoring failed validation', lastError)
  return json({ error: `The AI draft did not pass the story checks. Please try again. ${lastError}` }, 502)
}
