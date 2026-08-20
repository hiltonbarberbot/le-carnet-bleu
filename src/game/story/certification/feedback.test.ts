import { describe, expect, it } from 'vitest'
import type { StorylineReadinessVerdict } from '../review/readiness'
import {
  createFailureDetails,
  createReadinessRepairBrief,
  readCertificationFailureDetails,
} from './feedback'

function rejectedVerdict(): StorylineReadinessVerdict {
  return {
    schemaVersion: 2,
    definitionFingerprint: 'fingerprint-a',
    evaluatedAt: '2026-08-20T12:00:00.000Z',
    status: 'blocked',
    deterministicReview: { status: 'passed', findings: [], playthrough: null },
    independentReview: {
      status: 'rejected',
      kind: 'independent_llm',
      model: 'review/model',
      review: {
        schemaVersion: 1,
        definitionFingerprint: 'fingerprint-a',
        verdict: 'fail',
        summary: 'The proof is trapped.',
        checks: [{
          id: 'fair_play',
          verdict: 'fail',
          explanation: 'Only the culprit, Celeste, knows the marked glass was switched.',
          relatedIds: ['celeste', 'marked-glass'],
        }] as never,
        findings: [{
          severity: 'blocking',
          code: 'culprit_only_proof',
          message: 'Only the culprit, Celeste, knows the marked glass was switched.',
          relatedIds: ['celeste', 'marked-glass'],
        }],
      },
    },
    playabilityRehearsal: {
      status: 'not_run',
      kind: 'spoiler_isolated_llm',
      roleModel: 'role/model',
      hostModel: 'host/model',
      tableModel: 'table/model',
      judgeModel: 'judge/model',
      reason: 'independent_review_failed',
    },
    blockingReasons: ['Story logic review failed.'],
  }
}

describe('certification repair feedback', () => {
  it('keeps exact structured review context for the next author attempt', () => {
    const repair = createReadinessRepairBrief(rejectedVerdict())

    expect(repair.findings).toContainEqual({
      stage: 'independent_review',
      code: 'culprit_only_proof',
      message: 'Only the culprit, Celeste, knows the marked glass was switched.',
      relatedIds: ['celeste', 'marked-glass'],
    })
  })

  it('persists an actionable public reason without leaking the rejected plot', () => {
    const details = createFailureDetails(createReadinessRepairBrief(rejectedVerdict()), 2)

    expect(details).toEqual({
      schemaVersion: 1,
      attemptCount: 2,
      blockingReasons: [{
        stage: 'independent_review',
        code: 'culprit_only_proof',
        message: 'A required deduction depended on information held only by the culprit.',
      }, {
        stage: 'independent_review',
        code: 'fair_play',
        message: 'The independent review found a blocking logic issue.',
      }],
    })
    expect(JSON.stringify(details)).not.toContain('Celeste')
    expect(JSON.stringify(details)).not.toContain('marked-glass')
  })

  it('rejects malformed persisted details instead of reflecting arbitrary JSON', () => {
    expect(readCertificationFailureDetails({
      schemaVersion: 1,
      attemptCount: 2,
      blockingReasons: [{ stage: 'spoilers', code: 'x', message: 'Secret' }],
    })).toBeUndefined()
  })
})
