import { streamText } from 'ai'
import { createGameDefinition } from '../../definition/create'
import type { GameDefinitionInput } from '../../definition/contract'
import { createSettingBrief } from '../../setting/brief'
import type { SettingBrief, SettingBriefInput } from '../../setting/contract'
import { productNaming } from '../../../product/naming'
import { createStoryAuthoringBrief } from '../../story/authoring'
import { defaultLogicReviewModel, reviewStorylineLogic } from '../../story/review/gateway'
import {
  defaultRehearsalJudgeModel,
  defaultHostRehearsalModel,
  defaultRoleRehearsalModel,
} from '../../story/rehearsal/gateway'
import { rehearseStoryline } from '../../story/rehearsal/rehearse'
import {
  evaluateStorylineReadiness,
  formatStorylineReadinessFailure,
  storylineReadinessPassed,
  type StorylineReadinessVerdict,
} from '../../story/review/readiness'
import { classifyAiProviderError, createProblemReference, problemResponse } from './problem'
import { createAiCallSignal } from './deadline'

const model = process.env.AI_GATEWAY_AUTHOR_MODEL || 'openai/gpt-5.6-sol-fast'
export const maxDuration = 800

export type StorylineAuthoringAttempt =
  | { status: 'drafted'; definition: ReturnType<typeof createGameDefinition> }
  | { status: 'rejected'; kind: 'malformed' | 'invalid_definition'; reason: string }

export function isConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export function hasAllowedOrigin(request: Request) {
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
  const source = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
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

export function readSetting(value: unknown): SettingBriefInput | null {
  if (!value || typeof value !== 'object' || !('setting' in value)) return null
  const setting = (value as { setting?: unknown }).setting
  return setting && typeof setting === 'object' ? setting as SettingBriefInput : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const characterDetailKeys = [
  'costume',
  'publicFace',
  'invitationPretext',
  'invitationPromise',
  'privateIdentity',
  'privateObjective',
  'privateSecret',
  'traits',
  'objectives',
  'relationships',
] as const

function characterHasDetails(character: Record<string, unknown>) {
  return characterDetailKeys.every(key => character[key] !== undefined)
}

async function enrichDraftCharacters(
  draft: unknown,
  authoringBrief: string,
): Promise<unknown> {
  if (!isRecord(draft) || !isRecord(draft.story) || !Array.isArray(draft.story.characters)) return draft
  const characters = draft.story.characters
  if (characters.length !== 5 || !characters.every(isRecord) || characters.every(characterHasDetails)) return draft

  const storyContext = {
    title: draft.story.title,
    premise: draft.story.premise,
    solutionSummary: draft.story.solutionSummary,
    solutionSteps: draft.story.solutionSteps,
    caseTheory: draft.story.caseTheory,
    characters: characters.map(character => ({
      id: character.id,
      name: character.name,
      title: character.title,
    })),
  }

  const enriched = await Promise.all(characters.map(async (character, roleIndex) => {
    if (characterHasDetails(character)) return character
    const result = streamText({
      model,
      system: 'You are writing one private player dossier for a live fair-play mystery. Return only one complete JSON object with no markdown fences. Preserve the supplied mystery truth and never invent new evidence IDs.',
      prompt: `${authoringBrief}\n\nAuthored mystery core:\n${JSON.stringify(storyContext)}\n\nWrite the dossier fields for role ${roleIndex + 1}:\n${JSON.stringify(character)}\n\nReturn exactly this shape:\n{"costume":"","publicFace":"","invitationPretext":"","invitationPromise":"","privateIdentity":"","privateObjective":"","privateSecret":"","traits":["", ""],"objectives":[{"id":"unique-id","title":"","text":"","phase":"investigation|any","points":1}],"relationships":[{"roleId":"another-character-id","text":""}]}\n\nRules: make the role active and socially playable; exactly three distinct 1-3 point objectives; at least two traits; write a useful relationship to every other suspect; objectives must be feasible through voluntary conversation, bargaining, clue purchase, evidence sharing, or the public accusation system; do not require contact, coercion, private rooms, absent props, scripted investigation events, or knowledge outside this role's supplied starting secrets and public context.`,
      maxOutputTokens: 5000,
      abortSignal: createAiCallSignal(),
      providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'character-authoring'] } },
    })
    const details = parseJsonObject(await result.text)
    if (!isRecord(details)) throw new Error(`Character ${roleIndex + 1} did not return a dossier object.`)
    return {
      ...character,
      ...Object.fromEntries(characterDetailKeys.map(key => [key, details[key]])),
    }
  }))

  return {
    ...draft,
    story: {
      ...draft.story,
      characters: enriched,
    },
  }
}

const shape = `Return one JSON object with exactly this shape (never include fingerprint or schemaVersion):
{
  "id": "lowercase-slug", "title": "Story title",
  "story": {
    "id": "lowercase-slug", "seed": "lowercase-slug", "title": "", "subtitle": "", "premise": "", "totalPeople": 6, "host": { "id": "host", "name": "", "title": "" }, "victimRoleId": "host", "culpritRoleId": "exact character id",
    "characters": [{ "id": "unique-slug", "name": "", "title": "", "secrets": [{ "id": "unique-id", "text": "", "kind": "evidence|secret|colour", "aboutRoleIds": ["another-character-id"], "provenance": { "source": { "kind": "role", "roleId": "this-character-id" }, "independenceGroup": "role:this-character-id" } }] }],
    "publicEvidence": [{ "id": "unique-id", "text": "", "provenance": { "source": { "kind": "public", "openingStepId": "existing-opening-step-id" }, "independenceGroup": "opening:existing-opening-step-id" } }],
    "evening": [
      { "id": "arrival-stage", "title": "", "description": "introduce the cast", "durationMinutes": 5, "phase": "opening" },
      { "id": "incident-stage", "title": "", "description": "stage the incident and discover the body", "durationMinutes": 10, "phase": "opening" },
      { "id": "investigation-stage", "title": "", "description": "continuous free investigation", "durationMinutes": 90, "phase": "investigation" },
      { "id": "reveal-stage", "title": "", "description": "reveal the solution", "durationMinutes": 15, "phase": "reveal" }
    ],
    "solutionSteps": [{ "id": "solution-step-id", "title": "", "truth": "one atomic claim only", "evidence": ["independently-sourced-evidence-id-1", "independently-sourced-evidence-id-2"] }],
    "caseTheory": { "motiveStepId": "motive-step-id", "meansStepId": "means-step-id", "opportunityStepId": "opportunity-step-id", "actStepId": "fatal-act-step-id", "coverUpStepId": "optional-cover-up-step-id" },
    "openingSteps": [{ "id": "unique-id", "title": "", "trigger": "", "instructions": [{ "recipientRoleId": "host", "text": "Second-person direction only for the host." }, { "recipientRoleId": "exact-character-id", "text": "Second-person private cue only for this suspect." }], "execution": { "kind": "physical", "contact": "none", "reversible": true, "hostCued": true, "proxy": "host" }, "setupRequirementIds": ["requirement-id"], "settingRefs": [{ "kind": "availableProps", "id": "existing-setting-prop-id" }], "propIds": ["existing-setting-prop-id"] }],
    "solutionSummary": ""
  },
  "clueDecks": [{ "id": "deck-id", "label": "setting-specific source", "source": { "kind": "playableSpaces", "id": "existing-space-id" }, "clues": [{ "id": "unique-clue-id", "text": "", "supportsSolutionStepIds": ["solution-step-id"] }] }],
  "acts": [{ "id": "opening", "title": "", "operatorGoal": "stage the incident, then become Game Master", "playerGoal": "follow the cold-open cues until the body is discovered", "durationMinutes": 10, "completionLabel": "Open the investigation" }],
  "setupRequirements": [{ "id": "requirement-id", "label": "", "settingRef": { "kind": "playableSpaces|routes|usableFeatures|availableProps|safetyConstraints|accessibilityNeeds", "id": "exact existing resource id" } }]
}

Hard structural rules: this is the compact causal and gameplay blueprint; return only the minimal character fields shown above because the server authors rich player dossiers in separate bounded calls. Never return or rewrite the setting; the server attaches the host-validated setting after generation. Invent the fictional gathering and why this host invited these five suspects; exactly five characters and exactly two truthful starting secrets per character. Build the five characters' secret targets as an explicit ring: character 1 owns a secret with character 2 in aboutRoleIds, character 2 targets character 3, character 3 targets character 4, character 4 targets character 5, and character 5 targets character 1. Additional crosslinks are welcome, but this ring is mandatory so every character both knows something useful and is the subject of another suspect's secret. The secret-target graph must connect all five characters. Create exactly four ordered opening steps lasting no more than fifteen minutes total; every opening step is performed in array order; every instruction object addresses exactly one known recipientRoleId and its text speaks only to that recipient in second-person imperative prose; every step has exactly one host instruction, and every participating suspect gets a separate private instruction; never place a suspect's direction, dialogue, or action inside host prose; the opening introduces the cast, stages the only in-game death, reveals the body, and hands control to the players; create exactly four evening stages: two short opening stages whose phase is "opening", one continuous 60-180 minute investigation stage whose phase is "investigation", and one reveal stage whose phase is "reveal"; the investigation has no scripted acts and lets players talk, bargain, buy clues, pursue objectives, and call a public accusation at any time; no later event removes a player from play; create exactly two setting-backed clue decks containing exactly five clues total; every clue explicitly names only the solution-step IDs its text truly supports; every solution step cites at least two non-purchasable evidence IDs from different independenceGroup values, and neither route may be held only by the culprit. The cited facts must actually establish that exact truth, not merely its topic. Write exactly four distinct atomic solution steps—motive, concrete means, opportunity, and fatal act—and crosslink them through caseTheory. The complete ordered solution must identify the culprit without an unexplained off-page collapse. The opening has operator and player goals. Every opening step has a safe execution contract, explicit setupRequirementIds and settingRefs, and a propIds list mirroring its availableProps references. Use only resource IDs from the validated setting in the authoring brief. Keep every evidence, clue, secret, requirement, instruction, and solution-step text under 35 words; keep premise and solutionSummary under 120 words; omit decorative prose and never repeat a fact.`

export function storyCertificationModels() {
  return {
    author: model,
    review: process.env.AI_GATEWAY_REVIEW_MODEL ?? defaultLogicReviewModel,
    roleRehearsal: process.env.AI_GATEWAY_REHEARSAL_ROLE_MODEL ?? defaultRoleRehearsalModel,
    hostRehearsal: process.env.AI_GATEWAY_REHEARSAL_HOST_MODEL ?? defaultHostRehearsalModel,
    rehearsalJudge: process.env.AI_GATEWAY_REHEARSAL_JUDGE_MODEL ?? defaultRehearsalJudgeModel,
  }
}

/** One bounded authoring attempt. Durable orchestration may call this in a step. */
export async function authorStorylineAttempt(
  setting: SettingBrief,
  attempt: number,
  priorFailure?: string,
): Promise<StorylineAuthoringAttempt> {
  const authoringBrief = createStoryAuthoringBrief(setting)
  let output: unknown
  try {
    const result = streamText({
      model,
      system: 'You are a meticulous live-mystery designer. Return only the requested JSON object with no markdown fences. Build a playable, fair mystery from the verified setting; never reuse Maison Bleue demo canon.',
      prompt: [authoringBrief, shape, attempt ? `A prior draft failed validation. Correct these issues in a fresh complete draft:\n${priorFailure ?? 'The prior draft did not pass.'}` : 'Draft the complete game now.'].join('\n\n'),
      maxOutputTokens: 24000,
      abortSignal: createAiCallSignal(),
      providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'story-authoring'] } },
    })
    output = await enrichDraftCharacters(parseJsonObject(await result.text), authoringBrief)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (classifyAiProviderError(error) === 'invalid_output' || message.startsWith('Character ')) {
      return { status: 'rejected', kind: 'malformed', reason: message }
    }
    throw error
  }
  try {
    const draft = output && typeof output === 'object' && !Array.isArray(output)
      ? { ...output, setting }
      : output
    return { status: 'drafted', definition: createGameDefinition(draft as GameDefinitionInput) }
  } catch (error) {
    return {
      status: 'rejected',
      kind: 'invalid_definition',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

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

  const reference = createProblemReference()
  let lastError = 'The generated story was invalid.'
  let lastReadiness: StorylineReadinessVerdict | undefined
  const models = storyCertificationModels()
  const reviewModel = models.review
  const roleRehearsalModel = models.roleRehearsal
  const hostRehearsalModel = models.hostRehearsal
  const rehearsalJudgeModel = models.rehearsalJudge
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let authored: StorylineAuthoringAttempt
    try {
      authored = await authorStorylineAttempt(setting, attempt, lastError)
    } catch (error) {
      const code = classifyAiProviderError(error)
      if (code === 'invalid_output' && attempt === 0) {
        lastError = 'The model did not return the requested story shape.'
        continue
      }
      console.error('AI story provider request failed', { reference, code, error })
      return problemResponse(code, { reference })
    }

    if (authored.status === 'rejected') {
      lastError = authored.reason
      continue
    }
    const definition = authored.definition

    try {
      const evaluation = await evaluateStorylineReadiness(definition, {
        model: reviewModel,
        review: candidate => reviewStorylineLogic(candidate, { model: reviewModel }),
        rehearsal: {
          roleModel: roleRehearsalModel,
          hostModel: hostRehearsalModel,
          judgeModel: rehearsalJudgeModel,
          run: candidate => rehearseStoryline(candidate, {
            roleModel: roleRehearsalModel,
            hostModel: hostRehearsalModel,
            judgeModel: rehearsalJudgeModel,
          }),
        },
      })
      lastReadiness = evaluation.verdict
      if (evaluation.reviewerError) {
        const code = classifyAiProviderError(evaluation.reviewerError)
        console.error('AI story logic review failed', { reference, code, error: evaluation.reviewerError })
        return problemResponse(code, { reference, details: { readiness: evaluation.verdict } })
      }
      if (evaluation.rehearsalError) {
        const code = classifyAiProviderError(evaluation.rehearsalError)
        console.error('AI storyline rehearsal failed', { reference, code, error: evaluation.rehearsalError })
        return problemResponse(code, { reference, details: { readiness: evaluation.verdict } })
      }
      if (!storylineReadinessPassed(evaluation.verdict)) {
        lastError = formatStorylineReadinessFailure(evaluation.verdict)
        continue
      }
      return json({
        definition,
        model,
        readiness: evaluation.verdict,
        logicReview: { ...evaluation.verdict.independentReview.review, model: reviewModel },
      })
    } catch (error) {
      const code = classifyAiProviderError(error)
      console.error('AI story logic review failed', { reference, code, error })
      return problemResponse(code, { reference })
    }
  }

  console.error('AI story authoring failed validation', { reference, error: lastError })
  return problemResponse('invalid_output', {
    message: 'The AI story did not pass the fairness and playability checks.',
    reference,
    details: lastReadiness ? { readiness: lastReadiness } : undefined,
  })
}
