import { generateText, Output } from 'ai'
import { createGameDefinition } from '../../src/game/definition/create.js'
import type { GameDefinitionInput } from '../../src/game/definition/contract.js'
import { createSettingBrief } from '../../src/game/setting/brief.js'
import type { SettingBriefInput } from '../../src/game/setting/contract.js'
import { productNaming } from '../../src/product/naming.js'
import { createStoryAuthoringBrief } from '../../src/game/story/authoring.js'
import { classifyAiProviderError, createProblemReference, problemResponse } from './problem.js'

const model = process.env.AI_GATEWAY_AUTHOR_MODEL || 'google/gemini-3.6-flash'
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

function parseJsonObject(value: string) {
  const text = value.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const source = fenced?.[1] ?? text
  try {
    return JSON.parse(source) as unknown
  } catch {
    let repaired = ''
    let inString = false
    let escaping = false
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]
      if (inString) {
        repaired += character
        if (escaping) escaping = false
        else if (character === '\\') escaping = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') inString = true
      if (character === ',') {
        let next = index + 1
        while (/\s/.test(source[next] ?? '')) next += 1
        if (source[next] === '}' || source[next] === ']') continue
      }
      repaired += character
    }
    return JSON.parse(repaired) as unknown
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
  "setting": { "venueName": "", "location": "", "era": "", "playableSpaces": [{ "id": "space-id", "label": "", "description": "" }], "routes": [{ "id": "route-id", "label": "", "description": "", "spaceIds": ["space-id"], "accessibilityNotes": [""] }], "usableFeatures": [{ "id": "feature-id", "label": "", "description": "", "spaceIds": ["space-id"] }], "availableProps": [{ "id": "prop-id", "label": "", "description": "", "quantity": 1, "safetyNotes": [""] }], "tone": "", "safetyConstraints": [{ "id": "constraint-id", "label": "", "description": "" }], "accessibilityNeeds": [{ "id": "need-id", "label": "", "description": "" }], "contentBoundaries": [{ "id": "boundary-id", "label": "", "description": "" }] },
  "story": {
    "id": "lowercase-slug", "seed": "lowercase-slug", "title": "", "subtitle": "", "premise": "", "totalPeople": 6, "host": { "id": "host", "name": "", "title": "" }, "victimRoleId": "host", "culpritRoleId": "exact character id",
    "characters": [{ "id": "unique-slug", "name": "", "title": "", "costume": "", "publicFace": "", "invitationPretext": "", "invitationPromise": "", "privateIdentity": "", "privateObjective": "", "privateSecret": "", "traits": ["", ""], "objectives": [{ "id": "unique-id", "title": "", "text": "", "phase": "investigation|any", "points": 1 }], "relationships": [{ "roleId": "another-character-id", "text": "" }], "secrets": [{ "id": "unique-id", "text": "", "kind": "evidence|secret|colour", "aboutRoleIds": ["another-character-id"], "provenance": { "source": { "kind": "role", "roleId": "this-character-id" }, "independenceGroup": "role:this-character-id" } }] }],
    "publicEvidence": [{ "id": "unique-id", "text": "", "provenance": { "source": { "kind": "public", "openingStepId": "existing-opening-step-id" }, "independenceGroup": "public:unique-id" } }],
    "evening": [
      { "id": "arrival-stage", "title": "", "description": "introduce the cast", "durationMinutes": 5, "phase": "opening" },
      { "id": "incident-stage", "title": "", "description": "stage the incident and discover the body", "durationMinutes": 10, "phase": "opening" },
      { "id": "investigation-stage", "title": "", "description": "continuous free investigation", "durationMinutes": 90, "phase": "investigation" },
      { "id": "reveal-stage", "title": "", "description": "reveal the solution", "durationMinutes": 15, "phase": "reveal" }
    ],
    "solutionSteps": [{ "id": "solution-step-id", "title": "", "truth": "", "evidence": ["independently-sourced-evidence-id-1", "independently-sourced-evidence-id-2"] }],
    "openingSteps": [{ "id": "unique-id", "title": "", "trigger": "", "instruction": "", "execution": { "kind": "physical", "contact": "none", "reversible": true, "hostCued": true, "proxy": "host" }, "setupRequirementIds": ["requirement-id"], "settingRefs": [{ "kind": "availableProps", "id": "existing-setting-prop-id" }], "propIds": ["existing-setting-prop-id"] }],
    "solutionSummary": ""
  },
  "clueDecks": [{ "id": "deck-id", "label": "setting-specific source", "source": { "kind": "playableSpaces", "id": "existing-space-id" }, "clues": [{ "id": "unique-clue-id", "text": "", "supportsSolutionStepIds": ["solution-step-id"] }] }],
  "acts": [{ "id": "opening", "title": "", "operatorGoal": "stage the incident, then become Game Master", "playerGoal": "follow the cold-open cues until the body is discovered", "durationMinutes": 10, "completionLabel": "Open the investigation" }],
  "setupRequirements": [{ "id": "requirement-id", "label": "", "settingRef": { "kind": "playableSpaces|routes|usableFeatures|availableProps|safetyConstraints|accessibilityNeeds", "id": "exact existing resource id" } }]
}

Hard structural rules: invent the fictional gathering and why this host invited these five suspects; exactly five characters; every character has at least two playable traits, exactly three 1-3 point objectives, a variable non-empty relationship list, and truthful starting secrets about other suspects; objectives are the only player task system; the union of relationships and secret targets must connect all five characters, and every character must both know and be the subject of another suspect's secret; create exactly one host-only opening checklist lasting no more than fifteen minutes; every opening step is performed in array order; the opening introduces the cast, stages the only in-game death, reveals the body, and hands control to the players; create exactly four evening stages: two short opening stages whose phase is "opening", one continuous 60-180 minute investigation stage whose phase is "investigation", and one reveal stage whose phase is "reveal"; the investigation has no scripted acts and lets players talk, bargain, buy clues, pursue objectives, and call a public accusation at any time; no later event removes a player from play; create exactly two setting-backed clue decks containing exactly five clues total; every clue explicitly names the solution-step IDs it supports; every solution step cites at least two non-purchasable evidence IDs from different independenceGroup values; the opening has operator and player goals. Every opening step has a safe execution contract, explicit setupRequirementIds and settingRefs, and a propIds list mirroring its availableProps references. Copy the validated setting and all resource IDs exactly.`

export function GET() {
  const available = isConfigured()
  return json({ available, model: available ? model : undefined })
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return problemResponse('invalid_request', { message: 'Cross-origin AI requests are not allowed.', status: 403 })
  if (!isConfigured()) return problemResponse('not_configured')

  let settingInput: SettingBriefInput | null = null
  try {
    settingInput = readSetting(await request.json())
  } catch {
    return problemResponse('invalid_request', { message: 'Request body must be valid JSON.' })
  }
  if (!settingInput) return problemResponse('invalid_request', { message: 'A setting brief is required.' })

  let setting
  try {
    setting = createSettingBrief(settingInput)
  } catch (error) {
    return problemResponse('invalid_request', {
      message: error instanceof Error ? error.message : 'The setting brief is incomplete.',
    })
  }

  const authoringBrief = createStoryAuthoringBrief(setting)
  const reference = createProblemReference()
  let lastError = 'The generated story was invalid.'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let output: unknown
    try {
      const result = await generateText({
        model,
        system: 'You are a meticulous live-mystery designer. Return only the requested JSON object with no markdown fences. Build a playable, fair mystery from the verified setting; never reuse Maison Bleue demo canon.',
        prompt: [authoringBrief, shape, attempt ? `A prior draft failed validation. Correct these issues in a fresh complete draft:\n${lastError}` : 'Draft the complete game now.'].join('\n\n'),
        output: Output.json({ name: 'setting_specific_game_definition', description: `A complete validated ${productNaming.name} game definition.` }),
        maxOutputTokens: 12000,
        temperature: 0.7,
        providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'story-authoring'] } },
      })
      output = result.output ?? (result.text ? parseJsonObject(result.text) : undefined)
    } catch (error) {
      const code = classifyAiProviderError(error)
      if (code === 'invalid_output' && attempt === 0) {
        lastError = 'The model did not return the requested story shape.'
        continue
      }
      console.error('AI story provider request failed', { reference, code, error })
      return problemResponse(code, { reference })
    }

    try {
      const definition = createGameDefinition(output as GameDefinitionInput)
      return json({ definition, model })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  console.error('AI story authoring failed validation', { reference, error: lastError })
  return problemResponse('invalid_output', {
    message: 'The AI story did not pass the fairness and playability checks.',
    reference,
  })
}
