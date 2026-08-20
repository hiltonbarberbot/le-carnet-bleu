import { describe, expect, it, vi } from 'vitest'
import { createDemoGame } from '../../demo'
import { logicCheckIds, type StoryLogicReview } from './contract'
import {
  rehearseStoryline,
  rehearsalJudgeCheckIds,
  type RehearsalJudgeReview,
  type HostRehearsalReport,
  type RoleRehearsalReport,
} from '../rehearsal'
import {
  evaluateStorylineReadiness,
  storylineReadinessPassed,
  validateStorylineReadinessVerdict,
} from './readiness'

function passingReview(fingerprint: string): StoryLogicReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: fingerprint,
    verdict: 'pass',
    summary: 'The authored information paths make the mystery playable to its end.',
    checks: logicCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function readyRoleReport(definition: ReturnType<typeof createDemoGame>, roleIndex: number): RoleRehearsalReport {
  const role = definition.story.characters[roleIndex]
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    participantRef: `player-${roleIndex + 1}`,
    status: 'ready',
    summary: 'I have an actionable route through free play.',
    actionableFacts: [{ factId: role.secrets[0]?.id ?? definition.story.publicEvidence[0].id, canShare: true, intendedUse: 'Trade it for corroboration.' }],
    objectiveAssessments: role.objectives.map(objective => ({ objectiveId: objective.id, feasibility: 'feasible', route: 'Ask and bargain during free play.', blockers: [] })),
    investigationMoves: ['Compare accounts.'],
    questionsToPursue: ['Who can corroborate this?'],
    deductionRisks: [],
  }
}

function passingJudge(definition: ReturnType<typeof createDemoGame>): RehearsalJudgeReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    verdict: 'pass',
    summary: 'The full information graph survives isolated play.',
    checks: rehearsalJudgeCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function readyHostReport(definition: ReturnType<typeof createDemoGame>): HostRehearsalReport {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    status: 'ready',
    summary: 'The authored host path is complete.',
    setupAssessments: definition.setupRequirements.map(requirement => ({ requirementId: requirement.id, feasibility: 'feasible', execution: 'Prepare the referenced resource.', blockers: [] })),
    openingAssessments: definition.story.openingSteps.map(step => ({ stepId: step.id, feasibility: 'feasible', execution: 'Follow and complete the host cue.', blockers: [] })),
    runtimeAssessment: { feasibility: 'feasible', execution: 'Operate the full session lifecycle.', blockers: [] },
    revealAssessment: { feasibility: 'feasible', execution: 'Deliver the authored solution and score.', blockers: [] },
    repairRisks: [],
  }
}

function rehearsalOptions() {
  return {
    roleModel: 'role/model',
    hostModel: 'host/model',
    judgeModel: 'judge/model',
    run: (definition: ReturnType<typeof createDemoGame>) => rehearseStoryline(definition, {
      roleModel: 'role/model',
      hostModel: 'host/model',
      judgeModel: 'judge/model',
      rehearseRole: async (candidate, roleIndex) => readyRoleReport(candidate, roleIndex),
      rehearseHost: async candidate => readyHostReport(candidate),
      judge: async candidate => passingJudge(candidate),
    }),
  }
}

const now = () => new Date('2026-08-20T12:00:00.000Z')

describe('storyline readiness gate', () => {
  it('certifies a storyline only after deterministic and independent reviews pass', async () => {
    const definition = createDemoGame('ready-story')
    const review = vi.fn().mockResolvedValue(passingReview(definition.fingerprint))

    const { verdict } = await evaluateStorylineReadiness(definition, { model: 'review/model', review, rehearsal: rehearsalOptions(), now })

    expect(verdict).toEqual(expect.objectContaining({
      schemaVersion: 2,
      definitionFingerprint: definition.fingerprint,
      evaluatedAt: '2026-08-20T12:00:00.000Z',
      status: 'playable',
      deterministicReview: expect.objectContaining({ status: 'passed', findings: [], playthrough: expect.objectContaining({ verdict: 'pass' }) }),
      independentReview: expect.objectContaining({ status: 'passed', model: 'review/model' }),
      playabilityRehearsal: expect.objectContaining({ status: 'passed', roleModel: 'role/model', hostModel: 'host/model', judgeModel: 'judge/model' }),
      blockingReasons: [],
    }))
    expect(storylineReadinessPassed(verdict)).toBe(true)
    expect(validateStorylineReadinessVerdict(definition, verdict)).toEqual([])
  })

  it('does not spend a reviewer call when deterministic validation fails', async () => {
    const definition = structuredClone(createDemoGame('broken-story'))
    definition.story.solutionSteps[0].evidence = [definition.story.solutionSteps[0].evidence[0]]
    const review = vi.fn()

    const { verdict } = await evaluateStorylineReadiness(definition, { model: 'review/model', review, rehearsal: rehearsalOptions(), now })

    expect(review).not.toHaveBeenCalled()
    expect(verdict.status).toBe('blocked')
    expect(verdict.deterministicReview.status).toBe('failed')
    expect(verdict.independentReview.status).toBe('not_run')
    expect(storylineReadinessPassed(verdict)).toBe(false)
  })

  it('blocks a structurally valid story rejected by the independent reviewer', async () => {
    const definition = createDemoGame('rejected-story')
    const rejected = passingReview(definition.fingerprint)
    rejected.verdict = 'fail'
    rejected.checks.find(check => check.id === 'endgame')!.verdict = 'fail'
    rejected.findings.push({ severity: 'blocking', code: 'other', message: 'The final accusation cannot be resolved from authored facts.', relatedIds: [] })

    const { verdict } = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: async () => rejected,
      rehearsal: rehearsalOptions(),
      now,
    })

    expect(verdict.status).toBe('blocked')
    expect(verdict.independentReview.status).toBe('rejected')
    expect(verdict.blockingReasons.join('\n')).toContain('final accusation')
  })

  it('blocks when the reviewer fails instead of treating the review as skipped', async () => {
    const definition = createDemoGame('review-error-story')
    const providerError = new Error('provider unavailable')

    const result = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: async () => { throw providerError },
      rehearsal: rehearsalOptions(),
      now,
    })

    expect(result.verdict.status).toBe('blocked')
    expect(result.verdict.independentReview.status).toBe('failed')
    expect(storylineReadinessPassed(result.verdict)).toBe(false)
    expect(result.reviewerError).toBe(providerError)
  })

  it('rejects a forged playable verdict whose independent review did not run', async () => {
    const definition = structuredClone(createDemoGame('forged-story'))
    definition.fingerprint = 'tampered'
    const { verdict } = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: vi.fn(),
      rehearsal: rehearsalOptions(),
      now,
    })
    const forged = { ...verdict, status: 'playable' as const }

    expect(storylineReadinessPassed(forged)).toBe(false)
    expect(validateStorylineReadinessVerdict(definition, forged)).toContain(
      'readiness verdict cannot be playable unless every required review passed',
    )
  })

  it('rejects a persisted passport that omits the deterministic playthrough', async () => {
    const definition = createDemoGame('missing-playthrough')
    const { verdict } = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: async () => passingReview(definition.fingerprint),
      rehearsal: rehearsalOptions(),
      now,
    })
    const forged = {
      ...verdict,
      deterministicReview: { ...verdict.deterministicReview, playthrough: null },
    }

    expect(storylineReadinessPassed(forged)).toBe(false)
    expect(validateStorylineReadinessVerdict(definition, forged)).toContain(
      'readiness deterministic review passed without a matching successful playthrough',
    )
    expect(validateStorylineReadinessVerdict(definition, null)).toEqual(['readiness verdict is not an object'])
  })

  it('blocks when the play rehearsal fails instead of accepting the semantic review alone', async () => {
    const definition = createDemoGame('rehearsal-error-story')
    const providerError = new Error('role model unavailable')
    const result = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: async () => passingReview(definition.fingerprint),
      rehearsal: {
        roleModel: 'role/model',
        hostModel: 'host/model',
        judgeModel: 'judge/model',
        run: async () => { throw providerError },
      },
      now,
    })

    expect(result.verdict.status).toBe('blocked')
    expect(result.verdict.independentReview.status).toBe('passed')
    expect(result.verdict.playabilityRehearsal.status).toBe('failed')
    expect(result.rehearsalError).toBe(providerError)
  })

  it('rejects a persisted passport that omits the spoiler-isolated rehearsal', async () => {
    const definition = createDemoGame('missing-rehearsal')
    const { verdict } = await evaluateStorylineReadiness(definition, {
      model: 'review/model',
      review: async () => passingReview(definition.fingerprint),
      rehearsal: rehearsalOptions(),
      now,
    })
    const forged = { ...verdict, playabilityRehearsal: undefined }

    expect(validateStorylineReadinessVerdict(definition, forged)).toContain(
      'readiness verdict has no valid playability rehearsal identity',
    )
  })
})
