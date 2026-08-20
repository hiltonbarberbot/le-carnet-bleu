import type { StorylineDefinition } from '../../definition/contract'

export const logicCheckIds = [
  'coherence',
  'culprit',
  'motive',
  'means',
  'opportunity',
  'act',
  'cover_up',
  'fair_play',
  'clue_links',
  'opening_consistency',
  'setting_consistency',
  'production_simplicity',
  'objective_achievability',
  'information_flow',
  'endgame',
] as const

export type LogicCheckId = typeof logicCheckIds[number]

export type StoryLogicReview = {
  schemaVersion: 1
  definitionFingerprint: string
  verdict: 'pass' | 'fail'
  summary: string
  checks: Array<{
    id: LogicCheckId
    verdict: 'pass' | 'fail'
    explanation: string
    relatedIds: string[]
  }>
  findings: Array<{
    severity: 'blocking' | 'warning'
    code: 'contradiction' | 'unsupported_claim' | 'culprit_only_proof' | 'mislinked_evidence' | 'mislinked_clue' | 'missing_means' | 'missing_opportunity' | 'opening_mismatch' | 'setting_mismatch' | 'excessive_production' | 'impossible_objective' | 'information_dead_end' | 'broken_endgame' | 'other'
    message: string
    relatedIds: string[]
  }>
}

export const storyLogicReviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'definitionFingerprint', 'verdict', 'summary', 'checks', 'findings'],
  properties: {
    schemaVersion: { const: 1 },
    definitionFingerprint: { type: 'string', minLength: 1 },
    verdict: { enum: ['pass', 'fail'] },
    summary: { type: 'string', minLength: 1 },
    checks: {
      type: 'array',
      minItems: logicCheckIds.length,
      maxItems: logicCheckIds.length,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'explanation', 'relatedIds'],
        properties: {
          id: { enum: [...logicCheckIds] },
          verdict: { enum: ['pass', 'fail'] },
          explanation: { type: 'string', minLength: 1 },
          relatedIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'code', 'message', 'relatedIds'],
        properties: {
          severity: { enum: ['blocking', 'warning'] },
          code: { enum: ['contradiction', 'unsupported_claim', 'culprit_only_proof', 'mislinked_evidence', 'mislinked_clue', 'missing_means', 'missing_opportunity', 'opening_mismatch', 'setting_mismatch', 'excessive_production', 'impossible_objective', 'information_dead_end', 'broken_endgame', 'other'] },
          message: { type: 'string', minLength: 1 },
          relatedIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateStoryLogicReview(definition: StorylineDefinition, value: unknown): string[] {
  if (!isRecord(value)) return ['logic review is not an object']
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push('logic review has an unsupported schema version')
  if (value.definitionFingerprint !== definition.fingerprint) errors.push('logic review fingerprint does not match the reviewed definition')
  if (!['pass', 'fail'].includes(String(value.verdict))) errors.push('logic review has an invalid verdict')
  if (typeof value.summary !== 'string' || !value.summary.trim()) errors.push('logic review has no summary')
  if (!Array.isArray(value.checks)) {
    errors.push('logic review has no checks')
  } else {
    const ids = value.checks.filter(isRecord).map(check => String(check.id))
    for (const id of logicCheckIds) if (ids.filter(candidate => candidate === id).length !== 1) errors.push(`logic review must contain exactly one ${id} check`)
    for (const [index, check] of value.checks.entries()) {
      if (!isRecord(check) || !logicCheckIds.includes(check.id as LogicCheckId)) errors.push(`logic review check ${index + 1} is invalid`)
      else if (!['pass', 'fail'].includes(String(check.verdict)) || typeof check.explanation !== 'string' || !check.explanation.trim() || !Array.isArray(check.relatedIds) || check.relatedIds.some(id => typeof id !== 'string' || !id.trim())) errors.push(`logic review check ${check.id} is incomplete`)
    }
  }
  if (!Array.isArray(value.findings)) {
    errors.push('logic review findings must be a list')
  } else {
    for (const [index, finding] of value.findings.entries()) {
      if (!isRecord(finding)
        || !['blocking', 'warning'].includes(String(finding.severity))
        || typeof finding.code !== 'string'
        || typeof finding.message !== 'string'
        || !finding.message.trim()
        || !Array.isArray(finding.relatedIds)
        || finding.relatedIds.some(id => typeof id !== 'string' || !id.trim())) {
        errors.push(`logic review finding ${index + 1} is incomplete`)
      }
    }
  }
  if (Array.isArray(value.checks) && Array.isArray(value.findings)) {
    const hasFailedCheck = value.checks.some(check => isRecord(check) && check.verdict === 'fail')
    const hasBlocker = value.findings.some(finding => isRecord(finding) && finding.severity === 'blocking')
    if (value.verdict === 'pass' && (hasFailedCheck || hasBlocker)) errors.push('logic review pass contradicts a failed check or blocking finding')
    if (value.verdict === 'fail' && !hasFailedCheck && !hasBlocker) errors.push('logic review fail has no failed check or blocking finding')
  }
  return [...new Set(errors)]
}

export function logicReviewPassed(review: StoryLogicReview): boolean {
  return review.verdict === 'pass'
    && review.checks.every(check => check.verdict === 'pass')
    && review.findings.every(finding => finding.severity !== 'blocking')
}

export function formatLogicReviewFailure(review: StoryLogicReview): string {
  const failedChecks = review.checks.filter(check => check.verdict === 'fail').map(check => `${check.id}: ${check.explanation}`)
  const blockers = review.findings.filter(finding => finding.severity === 'blocking').map(finding => `${finding.code}: ${finding.message}`)
  return ['Story logic review failed.', ...failedChecks, ...blockers].join('\n')
}

export function createStoryLogicReviewPrompt(definition: StorylineDefinition): string {
  const evidence = [
    ...definition.story.publicEvidence.map(item => ({ ...item, ownerRoleId: null, ownerIsCulprit: false })),
    ...definition.story.characters.flatMap(character => character.secrets.map(item => ({
      ...item,
      ownerRoleId: character.id,
      ownerIsCulprit: character.id === definition.story.culpritRoleId,
    }))),
  ]
  return `Perform the final good-faith logic review of this live murder mystery. Schema validity has already passed; do not reward formal completeness.

Fail the review if the authored facts do not actually add up. In particular:
- distinguish evidence of background or motive from evidence of means, opportunity, and the fatal act;
- treat culprit-only knowledge as unreliable unless another authored source independently exposes it;
- require the cited evidence for each solution step to entail that step, not merely concern the same topic;
- verify every purchasable clue is linked to the truth it really supports;
- reject contradictions between the summary, ordered solution, dossiers, opening, physical execution, and setting;
- require players to have a fair route to identify the culprit without confession, lucky guessing, or buying every clue;
- verify every scored objective is achievable through the authored free-play affordances, without a forced confession, unavailable fact, impossible prop, or scripted future event;
- trace information flow across the private dossiers and public evidence: each player must begin with actionable material, and no required deduction or objective may be trapped with one uncooperative player;
- verify the accusation and reveal can actually conclude the game, score objectives, explain the complete causal chain, and resolve the authored evidence without an improvised repair;
- fail missing or hand-waved murder mechanics, including an unexplained off-page collapse;
- fail unsafe or setting-invented physical action;
- fail needless production burden even when it fits the numeric ceiling: compound or bespoke props, fabrication, hidden compartments, locks, recordings, consumables, object swaps, and timed choreography must be replaced by dossier or public facts unless physically indispensable;
- require the mystery to remain understandable and solvable if every decorative object is absent.

Return every required check exactly once. A warning is only for genuine polish that cannot change the deduction. Any unsupported causal claim, wrong link, missing means/opportunity, contradiction, or unfair proof is blocking. Set verdict to fail whenever any check fails or any blocking finding exists.

Definition fingerprint: ${definition.fingerprint}

Review packet:
${JSON.stringify({
    id: definition.id,
    title: definition.title,
    setting: definition.setting,
    culpritRoleId: definition.story.culpritRoleId,
    story: definition.story,
    evidence,
    clueDecks: definition.clueDecks,
    openingSteps: definition.story.openingSteps,
    setupRequirements: definition.setupRequirements,
  })}`
}
