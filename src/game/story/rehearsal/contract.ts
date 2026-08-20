import type { StorylineDefinition } from '../../definition/contract'
import { tableRehearsalPassed, validateTableRehearsalReport } from './table'
import type { TableRehearsalReport } from './table'

export const rehearsalJudgeCheckIds = [
  'deducibility',
  'objective_feasibility',
  'information_flow',
  'reveal_consistency',
  'clue_independence',
] as const

export type RehearsalJudgeCheckId = typeof rehearsalJudgeCheckIds[number]

export type RoleRehearsalReport = {
  schemaVersion: 1
  definitionFingerprint: string
  participantRef: string
  status: 'ready' | 'blocked' | 'inconclusive'
  summary: string
  actionableFacts: Array<{
    factId: string
    canShare: boolean
    intendedUse: string
  }>
  objectiveAssessments: Array<{
    objectiveId: string
    feasibility: 'feasible' | 'blocked' | 'uncertain'
    route: string
    blockers: string[]
  }>
  investigationMoves: string[]
  questionsToPursue: string[]
  deductionRisks: string[]
}

export type HostRehearsalReport = {
  schemaVersion: 1
  definitionFingerprint: string
  status: 'ready' | 'blocked' | 'inconclusive'
  summary: string
  setupAssessments: Array<{
    requirementId: string
    feasibility: 'feasible' | 'blocked' | 'uncertain'
    execution: string
    blockers: string[]
  }>
  openingAssessments: Array<{
    stepId: string
    feasibility: 'feasible' | 'blocked' | 'uncertain'
    execution: string
    blockers: string[]
  }>
  runtimeAssessment: {
    feasibility: 'feasible' | 'blocked' | 'uncertain'
    execution: string
    blockers: string[]
  }
  revealAssessment: {
    feasibility: 'feasible' | 'blocked' | 'uncertain'
    execution: string
    blockers: string[]
  }
  repairRisks: string[]
}

export type RehearsalJudgeReview = {
  schemaVersion: 1
  definitionFingerprint: string
  verdict: 'pass' | 'fail'
  summary: string
  checks: Array<{
    id: RehearsalJudgeCheckId
    verdict: 'pass' | 'fail'
    explanation: string
    relatedIds: string[]
  }>
  findings: Array<{
    severity: 'blocking' | 'warning'
    code: 'not_deducible' | 'impossible_objective' | 'information_dead_end' | 'reveal_contradiction' | 'clue_dependency' | 'role_not_ready' | 'other'
    message: string
    relatedIds: string[]
  }>
}

export type StorylineRehearsalReport = {
  schemaVersion: 1
  definitionFingerprint: string
  roleModel: string
  hostModel: string
  judgeModel: string
  tableModel: string
  verdict: 'pass' | 'fail'
  tableReport: TableRehearsalReport
  roleReports: RoleRehearsalReport[]
  hostReport: HostRehearsalReport
  judgeReview: RehearsalJudgeReview
  blockingReasons: string[]
}

export const roleRehearsalReportJsonSchema = (participantRef: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'definitionFingerprint', 'participantRef', 'status', 'summary', 'actionableFacts', 'objectiveAssessments', 'investigationMoves', 'questionsToPursue', 'deductionRisks'],
  properties: {
    schemaVersion: { const: 1 },
    definitionFingerprint: { type: 'string', minLength: 1 },
    participantRef: { const: participantRef },
    status: { enum: ['ready', 'blocked', 'inconclusive'] },
    summary: { type: 'string', minLength: 1 },
    actionableFacts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factId', 'canShare', 'intendedUse'],
        properties: {
          factId: { type: 'string', minLength: 1 },
          canShare: { type: 'boolean' },
          intendedUse: { type: 'string', minLength: 1 },
        },
      },
    },
    objectiveAssessments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['objectiveId', 'feasibility', 'route', 'blockers'],
        properties: {
          objectiveId: { type: 'string', minLength: 1 },
          feasibility: { enum: ['feasible', 'blocked', 'uncertain'] },
          route: { type: 'string', minLength: 1 },
          blockers: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
    investigationMoves: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    questionsToPursue: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    deductionRisks: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
}) as const

export const rehearsalJudgeReviewJsonSchema = {
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
      minItems: rehearsalJudgeCheckIds.length,
      maxItems: rehearsalJudgeCheckIds.length,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'explanation', 'relatedIds'],
        properties: {
          id: { enum: [...rehearsalJudgeCheckIds] },
          verdict: { enum: ['pass', 'fail'] },
          explanation: { type: 'string', minLength: 1 },
          relatedIds: { type: 'array', items: { type: 'string', minLength: 1 } },
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
          code: { enum: ['not_deducible', 'impossible_objective', 'information_dead_end', 'reveal_contradiction', 'clue_dependency', 'role_not_ready', 'other'] },
          message: { type: 'string', minLength: 1 },
          relatedIds: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
  },
} as const

export const hostRehearsalReportJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'definitionFingerprint', 'status', 'summary', 'setupAssessments', 'openingAssessments', 'runtimeAssessment', 'revealAssessment', 'repairRisks'],
  properties: {
    schemaVersion: { const: 1 },
    definitionFingerprint: { type: 'string', minLength: 1 },
    status: { enum: ['ready', 'blocked', 'inconclusive'] },
    summary: { type: 'string', minLength: 1 },
    setupAssessments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirementId', 'feasibility', 'execution', 'blockers'],
        properties: {
          requirementId: { type: 'string', minLength: 1 },
          feasibility: { enum: ['feasible', 'blocked', 'uncertain'] },
          execution: { type: 'string', minLength: 1 },
          blockers: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
    openingAssessments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stepId', 'feasibility', 'execution', 'blockers'],
        properties: {
          stepId: { type: 'string', minLength: 1 },
          feasibility: { enum: ['feasible', 'blocked', 'uncertain'] },
          execution: { type: 'string', minLength: 1 },
          blockers: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
    runtimeAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['feasibility', 'execution', 'blockers'],
      properties: {
        feasibility: { enum: ['feasible', 'blocked', 'uncertain'] },
        execution: { type: 'string', minLength: 1 },
        blockers: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
    revealAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['feasibility', 'execution', 'blockers'],
      properties: {
        feasibility: { enum: ['feasible', 'blocked', 'uncertain'] },
        execution: { type: 'string', minLength: 1 },
        blockers: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
    repairRisks: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasInvalidStrings(value: unknown, allowEmpty = false) {
  return !Array.isArray(value) || value.some(item => typeof item !== 'string' || (!allowEmpty && !item.trim()))
}

export function validateRoleRehearsalReport(
  definition: StorylineDefinition,
  roleIndex: number,
  value: unknown,
): string[] {
  if (!isRecord(value)) return [`role rehearsal ${roleIndex + 1} is not an object`]
  const role = definition.story.characters[roleIndex]
  if (!role) return [`role rehearsal ${roleIndex + 1} has no matching character`]
  const participantRef = `player-${roleIndex + 1}`
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push(`${participantRef} rehearsal has an unsupported schema version`)
  if (value.definitionFingerprint !== definition.fingerprint) errors.push(`${participantRef} rehearsal fingerprint does not match the storyline`)
  if (value.participantRef !== participantRef) errors.push(`${participantRef} rehearsal has the wrong participant reference`)
  if (!['ready', 'blocked', 'inconclusive'].includes(String(value.status))) errors.push(`${participantRef} rehearsal has an invalid status`)
  if (typeof value.summary !== 'string' || !value.summary.trim()) errors.push(`${participantRef} rehearsal has no summary`)

  const availableFacts = new Set([
    ...role.secrets.map(secret => secret.id),
    ...definition.story.publicEvidence.map(evidence => evidence.id),
  ])
  if (!Array.isArray(value.actionableFacts) || value.actionableFacts.length === 0) {
    errors.push(`${participantRef} rehearsal has no actionable facts`)
  } else {
    const ids: string[] = []
    value.actionableFacts.forEach((item, index) => {
      if (!isRecord(item)
        || typeof item.factId !== 'string'
        || !availableFacts.has(item.factId)
        || typeof item.canShare !== 'boolean'
        || typeof item.intendedUse !== 'string'
        || !item.intendedUse.trim()) {
        errors.push(`${participantRef} actionable fact ${index + 1} is invalid`)
      } else ids.push(item.factId)
    })
    if (new Set(ids).size !== ids.length) errors.push(`${participantRef} rehearsal repeats an actionable fact`)
  }

  if (!Array.isArray(value.objectiveAssessments)) {
    errors.push(`${participantRef} rehearsal has no objective assessments`)
  } else {
    const expectedIds = role.objectives.map(objective => objective.id)
    const actualIds: string[] = []
    value.objectiveAssessments.forEach((item, index) => {
      if (!isRecord(item)
        || typeof item.objectiveId !== 'string'
        || !expectedIds.includes(item.objectiveId)
        || !['feasible', 'blocked', 'uncertain'].includes(String(item.feasibility))
        || typeof item.route !== 'string'
        || !item.route.trim()
        || hasInvalidStrings(item.blockers, true)) {
        errors.push(`${participantRef} objective assessment ${index + 1} is invalid`)
      } else actualIds.push(item.objectiveId)
    })
    for (const objectiveId of expectedIds) {
      if (actualIds.filter(id => id === objectiveId).length !== 1) errors.push(`${participantRef} rehearsal must assess objective ${objectiveId} exactly once`)
    }
    const unresolved = value.objectiveAssessments.some(item => isRecord(item) && item.feasibility !== 'feasible')
    if (value.status === 'ready' && unresolved) errors.push(`${participantRef} cannot be ready with an unresolved objective`)
    if (value.status === 'blocked' && !value.objectiveAssessments.some(item => isRecord(item) && item.feasibility === 'blocked')) {
      errors.push(`${participantRef} is blocked without a blocked objective`)
    }
  }

  if (hasInvalidStrings(value.investigationMoves)) errors.push(`${participantRef} rehearsal has no usable investigation moves`)
  if (hasInvalidStrings(value.questionsToPursue)) errors.push(`${participantRef} rehearsal has no questions to pursue`)
  if (hasInvalidStrings(value.deductionRisks, true)) errors.push(`${participantRef} rehearsal deduction risks are invalid`)
  return [...new Set(errors)]
}

export function validateRehearsalJudgeReview(definition: StorylineDefinition, value: unknown): string[] {
  if (!isRecord(value)) return ['rehearsal judge review is not an object']
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push('rehearsal judge review has an unsupported schema version')
  if (value.definitionFingerprint !== definition.fingerprint) errors.push('rehearsal judge fingerprint does not match the storyline')
  if (!['pass', 'fail'].includes(String(value.verdict))) errors.push('rehearsal judge review has an invalid verdict')
  if (typeof value.summary !== 'string' || !value.summary.trim()) errors.push('rehearsal judge review has no summary')
  if (!Array.isArray(value.checks)) {
    errors.push('rehearsal judge review has no checks')
  } else {
    const ids = value.checks.filter(isRecord).map(check => String(check.id))
    for (const id of rehearsalJudgeCheckIds) {
      if (ids.filter(candidate => candidate === id).length !== 1) errors.push(`rehearsal judge must contain exactly one ${id} check`)
    }
    value.checks.forEach((check, index) => {
      if (!isRecord(check)
        || !rehearsalJudgeCheckIds.includes(check.id as RehearsalJudgeCheckId)
        || !['pass', 'fail'].includes(String(check.verdict))
        || typeof check.explanation !== 'string'
        || !check.explanation.trim()
        || hasInvalidStrings(check.relatedIds, true)) errors.push(`rehearsal judge check ${index + 1} is invalid`)
    })
  }
  if (!Array.isArray(value.findings)) {
    errors.push('rehearsal judge findings must be a list')
  } else {
    value.findings.forEach((finding, index) => {
      if (!isRecord(finding)
        || !['blocking', 'warning'].includes(String(finding.severity))
        || !['not_deducible', 'impossible_objective', 'information_dead_end', 'reveal_contradiction', 'clue_dependency', 'role_not_ready', 'other'].includes(String(finding.code))
        || typeof finding.message !== 'string'
        || !finding.message.trim()
        || hasInvalidStrings(finding.relatedIds, true)) errors.push(`rehearsal judge finding ${index + 1} is invalid`)
    })
  }
  if (Array.isArray(value.checks) && Array.isArray(value.findings)) {
    const failedCheck = value.checks.some(check => isRecord(check) && check.verdict === 'fail')
    const blocker = value.findings.some(finding => isRecord(finding) && finding.severity === 'blocking')
    if (value.verdict === 'pass' && (failedCheck || blocker)) errors.push('rehearsal judge pass contradicts a failed check or blocking finding')
    if (value.verdict === 'fail' && !failedCheck && !blocker) errors.push('rehearsal judge fail has no failed check or blocking finding')
  }
  return [...new Set(errors)]
}

function validateHostAssessment(
  value: unknown,
  label: string,
  errors: string[],
) {
  if (!isRecord(value)
    || !['feasible', 'blocked', 'uncertain'].includes(String(value.feasibility))
    || typeof value.execution !== 'string'
    || !value.execution.trim()
    || hasInvalidStrings(value.blockers, true)) errors.push(`${label} is invalid`)
}

export function validateHostRehearsalReport(
  definition: StorylineDefinition,
  value: unknown,
): string[] {
  if (!isRecord(value)) return ['host rehearsal is not an object']
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push('host rehearsal has an unsupported schema version')
  if (value.definitionFingerprint !== definition.fingerprint) errors.push('host rehearsal fingerprint does not match the storyline')
  if (!['ready', 'blocked', 'inconclusive'].includes(String(value.status))) errors.push('host rehearsal has an invalid status')
  if (typeof value.summary !== 'string' || !value.summary.trim()) errors.push('host rehearsal has no summary')

  if (!Array.isArray(value.setupAssessments)) {
    errors.push('host rehearsal has no setup assessments')
  } else {
    const expectedIds = definition.setupRequirements.map(requirement => requirement.id)
    const ids: string[] = []
    value.setupAssessments.forEach((assessment, index) => {
      validateHostAssessment(assessment, `host setup assessment ${index + 1}`, errors)
      if (!isRecord(assessment) || typeof assessment.requirementId !== 'string' || !expectedIds.includes(assessment.requirementId)) {
        errors.push(`host setup assessment ${index + 1} has an invalid requirement`)
      } else ids.push(assessment.requirementId)
    })
    for (const id of expectedIds) if (ids.filter(candidate => candidate === id).length !== 1) errors.push(`host rehearsal must assess setup requirement ${id} exactly once`)
  }

  if (!Array.isArray(value.openingAssessments)) {
    errors.push('host rehearsal has no opening assessments')
  } else {
    const expectedIds = definition.story.openingSteps.map(step => step.id)
    const ids: string[] = []
    value.openingAssessments.forEach((assessment, index) => {
      validateHostAssessment(assessment, `host opening assessment ${index + 1}`, errors)
      if (!isRecord(assessment) || typeof assessment.stepId !== 'string' || !expectedIds.includes(assessment.stepId)) {
        errors.push(`host opening assessment ${index + 1} has an invalid step`)
      } else ids.push(assessment.stepId)
    })
    for (const id of expectedIds) if (ids.filter(candidate => candidate === id).length !== 1) errors.push(`host rehearsal must assess opening step ${id} exactly once`)
  }

  validateHostAssessment(value.runtimeAssessment, 'host runtime assessment', errors)
  validateHostAssessment(value.revealAssessment, 'host reveal assessment', errors)
  if (hasInvalidStrings(value.repairRisks, true)) errors.push('host rehearsal repair risks are invalid')

  const assessments = [
    ...(Array.isArray(value.setupAssessments) ? value.setupAssessments : []),
    ...(Array.isArray(value.openingAssessments) ? value.openingAssessments : []),
    value.runtimeAssessment,
    value.revealAssessment,
  ].filter(isRecord)
  const unresolved = assessments.some(assessment => assessment.feasibility !== 'feasible')
  const blocked = assessments.some(assessment => assessment.feasibility === 'blocked')
  if (value.status === 'ready' && (unresolved || (Array.isArray(value.repairRisks) && value.repairRisks.length))) {
    errors.push('host cannot be ready with unresolved execution or repair risks')
  }
  if (value.status === 'blocked' && !blocked) errors.push('host is blocked without a blocked execution assessment')
  if (value.status === 'inconclusive' && !unresolved) errors.push('host is inconclusive without an uncertain execution assessment')
  return [...new Set(errors)]
}

export function rehearsalJudgePassed(review: RehearsalJudgeReview) {
  return review.verdict === 'pass'
    && review.checks.every(check => check.verdict === 'pass')
    && review.findings.every(finding => finding.severity !== 'blocking')
}

export function validateStorylineRehearsalReport(
  definition: StorylineDefinition,
  value: unknown,
): string[] {
  if (!isRecord(value)) return ['storyline rehearsal report is not an object']
  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push('storyline rehearsal has an unsupported schema version')
  if (value.definitionFingerprint !== definition.fingerprint) errors.push('storyline rehearsal fingerprint does not match the storyline')
  if (typeof value.roleModel !== 'string' || !value.roleModel.trim()) errors.push('storyline rehearsal has no role model')
  if (typeof value.hostModel !== 'string' || !value.hostModel.trim()) errors.push('storyline rehearsal has no host model')
  if (typeof value.judgeModel !== 'string' || !value.judgeModel.trim()) errors.push('storyline rehearsal has no judge model')
  if (typeof value.tableModel !== 'string' || !value.tableModel.trim()) errors.push('storyline rehearsal has no table model')
  if (!['pass', 'fail'].includes(String(value.verdict))) errors.push('storyline rehearsal has an invalid verdict')
  if (!Array.isArray(value.roleReports) || value.roleReports.length !== definition.story.characters.length) {
    errors.push('storyline rehearsal must contain one report per suspect')
  } else {
    value.roleReports.forEach((report, index) => errors.push(...validateRoleRehearsalReport(definition, index, report)))
  }
  errors.push(...validateHostRehearsalReport(definition, value.hostReport))
  errors.push(...validateRehearsalJudgeReview(definition, value.judgeReview))
  errors.push(...validateTableRehearsalReport(definition, value.tableReport))
  if (hasInvalidStrings(value.blockingReasons, true)) errors.push('storyline rehearsal blocking reasons are invalid')

  const roleReports = Array.isArray(value.roleReports) ? value.roleReports.filter(isRecord) : []
  const rolesReady = roleReports.length === definition.story.characters.length
    && roleReports.every(report => report.status === 'ready')
  const hostReady = validateHostRehearsalReport(definition, value.hostReport).length === 0
    && (value.hostReport as HostRehearsalReport).status === 'ready'
  const judgePassed = validateRehearsalJudgeReview(definition, value.judgeReview).length === 0
    && rehearsalJudgePassed(value.judgeReview as RehearsalJudgeReview)
  const tablePassed = validateTableRehearsalReport(definition, value.tableReport).length === 0
    && tableRehearsalPassed(value.tableReport as TableRehearsalReport)
    && (value.tableReport as TableRehearsalReport).model === value.tableModel
  const hasNoBlockers = Array.isArray(value.blockingReasons) && value.blockingReasons.length === 0
  const passes = rolesReady && hostReady && judgePassed && tablePassed && hasNoBlockers
  if (value.verdict === 'pass' && !passes) errors.push('storyline rehearsal cannot pass unless every player and the judge passed')
  if (value.verdict === 'fail' && passes) errors.push('storyline rehearsal cannot fail when every player and the judge passed')
  return [...new Set(errors)]
}

export function storylineRehearsalPassed(report: StorylineRehearsalReport) {
  return report.verdict === 'pass'
    && report.roleReports.every(role => role.status === 'ready')
    && report.hostReport.status === 'ready'
    && report.tableReport.model === report.tableModel
    && tableRehearsalPassed(report.tableReport)
    && rehearsalJudgePassed(report.judgeReview)
    && report.blockingReasons.length === 0
}

export function formatStorylineRehearsalFailure(report: StorylineRehearsalReport) {
  return ['Spoiler-isolated play rehearsal failed.', ...report.blockingReasons].join('\n')
}
