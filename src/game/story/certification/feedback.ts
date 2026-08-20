import type { StorylineReadinessVerdict } from '../review/readiness'

export const certificationFailureStages = [
  'authoring',
  'deterministic_review',
  'independent_review',
  'rehearsal',
] as const

export type CertificationFailureStage = typeof certificationFailureStages[number]

/** Exact, private feedback passed only to the next authoring attempt. */
export type StorylineRepairFinding = {
  stage: CertificationFailureStage
  code: string
  message: string
  relatedIds: string[]
}

export type StorylineRepairBrief = {
  schemaVersion: 1
  findings: StorylineRepairFinding[]
}

/** Spoiler-safe feedback that may be persisted and shown to the host. */
export type CertificationBlockingReason = {
  stage: CertificationFailureStage
  code: string
  message: string
}

export type CertificationFailureDetails = {
  schemaVersion: 1
  attemptCount: number
  blockingReasons: CertificationBlockingReason[]
}

function compactFindings(findings: StorylineRepairFinding[]) {
  const seen = new Set<string>()
  return findings.filter(finding => {
    const key = `${finding.stage}\0${finding.code}\0${finding.message}`
    if (seen.has(key) || !finding.message.trim()) return false
    seen.add(key)
    return true
  }).slice(0, 24)
}

export function createAuthoringRepairBrief(
  reason: string,
  code: 'malformed_output' | 'invalid_definition' = 'invalid_definition',
): StorylineRepairBrief {
  const messages = reason.split('\n').map(message => message.trim()).filter(Boolean)
  return {
    schemaVersion: 1,
    findings: compactFindings((messages.length ? messages : ['The draft did not pass the authored-story contract.']).map(message => ({
      stage: 'authoring' as const,
      code,
      message,
      relatedIds: [],
    }))),
  }
}

export function createReadinessRepairBrief(verdict: StorylineReadinessVerdict): StorylineRepairBrief {
  const findings: StorylineRepairFinding[] = []

  if (verdict.deterministicReview.status === 'failed') {
    findings.push(...verdict.deterministicReview.findings.map(message => ({
      stage: 'deterministic_review' as const,
      code: 'deterministic_validation',
      message,
      relatedIds: [],
    })))
  }

  if (verdict.independentReview.status === 'rejected') {
    findings.push(...verdict.independentReview.review.findings
      .filter(finding => finding.severity === 'blocking')
      .map(finding => ({
        stage: 'independent_review' as const,
        code: finding.code,
        message: finding.message,
        relatedIds: finding.relatedIds,
      })))
    findings.push(...verdict.independentReview.review.checks
      .filter(check => check.verdict === 'fail')
      .map(check => ({
        stage: 'independent_review' as const,
        code: check.id,
        message: check.explanation,
        relatedIds: check.relatedIds,
      })))
  } else if (verdict.independentReview.status === 'failed') {
    findings.push({
      stage: 'independent_review',
      code: verdict.independentReview.failure.code,
      message: verdict.independentReview.failure.message,
      relatedIds: [],
    })
  }

  if (verdict.playabilityRehearsal.status === 'rejected') {
    const report = verdict.playabilityRehearsal.report
    findings.push(...report.judgeReview.findings
      .filter(finding => finding.severity === 'blocking')
      .map(finding => ({
        stage: 'rehearsal' as const,
        code: finding.code,
        message: finding.message,
        relatedIds: finding.relatedIds,
      })))
    findings.push(...report.judgeReview.checks
      .filter(check => check.verdict === 'fail')
      .map(check => ({
        stage: 'rehearsal' as const,
        code: check.id,
        message: check.explanation,
        relatedIds: check.relatedIds,
      })))
    findings.push(...report.roleReports.flatMap(role => role.objectiveAssessments
      .filter(objective => objective.feasibility !== 'feasible')
      .map(objective => ({
        stage: 'rehearsal' as const,
        code: 'impossible_objective',
        message: [objective.route, ...objective.blockers].filter(Boolean).join(' '),
        relatedIds: [role.participantRef, objective.objectiveId],
      }))))
    findings.push(...report.hostReport.repairRisks.map(message => ({
      stage: 'rehearsal' as const,
      code: 'host_execution',
      message,
      relatedIds: [],
    })))
  } else if (verdict.playabilityRehearsal.status === 'failed') {
    findings.push({
      stage: 'rehearsal',
      code: verdict.playabilityRehearsal.failure.code,
      message: verdict.playabilityRehearsal.failure.message,
      relatedIds: [],
    })
  }

  if (!findings.length) {
    findings.push(...verdict.blockingReasons.map(message => ({
      stage: 'deterministic_review' as const,
      code: 'readiness_blocked',
      message,
      relatedIds: [],
    })))
  }
  return { schemaVersion: 1, findings: compactFindings(findings) }
}

const safeMessages: Record<string, string> = {
  malformed_output: 'The draft could not be read as a complete game.',
  invalid_definition: 'The draft did not satisfy the required story and setting contract.',
  deterministic_validation: 'The rules check found a broken or unreachable game path.',
  readiness_blocked: 'The complete playability gate still found a blocking issue.',
  contradiction: 'The independent review found facts that contradicted each other.',
  unsupported_claim: 'A required deduction was not supported by the authored evidence.',
  culprit_only_proof: 'A required deduction depended on information held only by the culprit.',
  mislinked_evidence: 'Authored evidence was linked to a conclusion it did not establish.',
  mislinked_clue: 'A purchasable clue was linked to a conclusion it did not establish.',
  missing_means: 'The story did not clearly establish how the crime was possible.',
  means: 'The story did not clearly establish how the crime was possible.',
  missing_opportunity: 'The story did not fairly establish the culprit’s opportunity.',
  opportunity: 'The story did not fairly establish the culprit’s opportunity.',
  opening_mismatch: 'The opening could not be reconciled with the authored mystery.',
  setting_mismatch: 'Part of the game relied on a setting fact that was not available.',
  excessive_production: 'The game required too much physical staging or preparation.',
  production_simplicity: 'The game required too much physical staging or preparation.',
  impossible_objective: 'At least one player objective had no workable route during play.',
  objective_achievability: 'At least one player objective had no workable route during play.',
  information_dead_end: 'Essential information could become trapped with one player.',
  information_flow: 'Essential information could become trapped during play.',
  broken_endgame: 'The accusation or reveal could not resolve the complete mystery.',
  endgame: 'The accusation or reveal could not resolve the complete mystery.',
  not_deducible: 'Players could not reliably deduce the solution from their actual information.',
  deducibility: 'Players could not reliably deduce the solution from their actual information.',
  reveal_contradiction: 'The rehearsed reveal contradicted information available during play.',
  reveal_consistency: 'The rehearsed reveal contradicted information available during play.',
  clue_dependency: 'The rehearsal depended too heavily on optional purchased clues.',
  clue_independence: 'The rehearsal depended too heavily on optional purchased clues.',
  role_not_ready: 'At least one player did not have a workable route into the investigation.',
  host_execution: 'The host rehearsal found an unresolved staging or runtime risk.',
  rehearsal_failed: 'The player rehearsal could not be completed reliably.',
  invalid_rehearsal: 'The player rehearsal returned an unusable report.',
  reviewer_failed: 'The independent review could not be completed reliably.',
  invalid_review: 'The independent review returned an unusable report.',
}

function fallbackPublicMessage(stage: CertificationFailureStage) {
  if (stage === 'authoring') return 'The generated draft did not satisfy the authored-game contract.'
  if (stage === 'independent_review') return 'The independent review found a blocking logic issue.'
  if (stage === 'rehearsal') return 'The rehearsal found a blocking playability issue.'
  return 'The deterministic rules check found a blocking issue.'
}

export function createFailureDetails(repair: StorylineRepairBrief, attemptCount: number): CertificationFailureDetails {
  const seen = new Set<string>()
  const blockingReasons = repair.findings.flatMap(finding => {
    const message = safeMessages[finding.code] ?? fallbackPublicMessage(finding.stage)
    const key = `${finding.stage}\0${finding.code}\0${message}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ stage: finding.stage, code: finding.code, message }]
  }).slice(0, 6)
  return { schemaVersion: 1, attemptCount, blockingReasons }
}

export function readCertificationFailureDetails(value: unknown): CertificationFailureDetails | undefined {
  if (typeof value === 'string') {
    try {
      return readCertificationFailureDetails(JSON.parse(value) as unknown)
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== 1 || !Number.isInteger(candidate.attemptCount) || Number(candidate.attemptCount) < 1) return undefined
  if (!Array.isArray(candidate.blockingReasons)) return undefined
  const blockingReasons = candidate.blockingReasons.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const reason = item as Record<string, unknown>
    if (!certificationFailureStages.includes(reason.stage as CertificationFailureStage)
      || typeof reason.code !== 'string' || !reason.code.trim()
      || typeof reason.message !== 'string' || !reason.message.trim()) return []
    return [{ stage: reason.stage as CertificationFailureStage, code: reason.code, message: reason.message }]
  })
  if (blockingReasons.length !== candidate.blockingReasons.length) return undefined
  return { schemaVersion: 1, attemptCount: Number(candidate.attemptCount), blockingReasons }
}
