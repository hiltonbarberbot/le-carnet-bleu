import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assembleReadinessStep,
  certifyStorylineStep,
  draftStorylineStep,
  failCertificationStep,
  inspectStorylineStep,
  markCertificationRunning,
} from './steps'
import { certifyStorylineWorkflow } from './storybook'
import { createDemoStoryline, demoSetting } from '../../demo'
import { createSettingBrief } from '../../setting/brief'

vi.mock('./steps', () => ({
  assembleReadinessStep: vi.fn(),
  assembleRehearsalStep: vi.fn(),
  certifyStorylineStep: vi.fn(),
  draftStorylineStep: vi.fn(),
  failCertificationStep: vi.fn(),
  inspectStorylineStep: vi.fn(),
  judgeRehearsalStep: vi.fn(),
  markCertificationRunning: vi.fn(),
  rehearseHostStep: vi.fn(),
  rehearseRoleStep: vi.fn(),
  rehearseTableStep: vi.fn(),
  reviewStorylineStep: vi.fn(),
}))

const input = {
  jobId: '22222222-2222-4222-8222-222222222222',
  scope: { ownerId: 'owner-a' },
  source: { kind: 'setting' as const, setting: createSettingBrief(demoSetting) },
  models: {
    author: 'author/model',
    review: 'review/model',
    roleRehearsal: 'role/model',
    hostRehearsal: 'host/model',
    tableRehearsal: 'table/model',
    rehearsalJudge: 'judge/model',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('durable storyline certification workflow', () => {
  it('uses the first failure to request one fresh draft and persists neither rejected draft', async () => {
    vi.mocked(draftStorylineStep)
      .mockResolvedValueOnce({ status: 'rejected', kind: 'invalid_definition', reason: 'The means are unsupported.' })
      .mockResolvedValueOnce({ status: 'rejected', kind: 'invalid_definition', reason: 'The repair still has no independent opportunity proof.' })

    await expect(certifyStorylineWorkflow(input)).resolves.toEqual({ status: 'failed', jobId: input.jobId })

    expect(markCertificationRunning).toHaveBeenCalledWith(input.scope, input.jobId)
    expect(draftStorylineStep).toHaveBeenNthCalledWith(2, input.source.setting, 1, {
      schemaVersion: 1,
      findings: [{
        stage: 'authoring',
        code: 'invalid_definition',
        message: 'The means are unsupported.',
        relatedIds: [],
      }],
    })
    expect(certifyStorylineStep).not.toHaveBeenCalled()
    expect(failCertificationStep).toHaveBeenCalledWith(input.scope, input.jobId, expect.objectContaining({
      code: 'invalid_output',
      details: {
        schemaVersion: 1,
        attemptCount: 2,
        blockingReasons: [{
          stage: 'authoring',
          code: 'invalid_definition',
          message: 'The draft did not satisfy the required story and setting contract.',
        }],
      },
    }))
  })

  it('puts an imported storyline through the same gate without drafting a replacement', async () => {
    const definition = createDemoStoryline('imported-review')
    vi.mocked(inspectStorylineStep).mockResolvedValue({ findings: ['The means are unsupported.'], playthrough: null })
    vi.mocked(assembleReadinessStep).mockResolvedValue({
      verdict: {
        schemaVersion: 2,
        definitionFingerprint: definition.fingerprint,
        evaluatedAt: '2026-08-20T12:00:00.000Z',
        status: 'blocked',
        deterministicReview: { status: 'failed', findings: ['The means are unsupported.'], playthrough: null },
        independentReview: { status: 'not_run', kind: 'independent_llm', model: input.models.review, reason: 'deterministic_validation_failed' },
        playabilityRehearsal: {
          status: 'not_run',
          kind: 'spoiler_isolated_llm',
          roleModel: input.models.roleRehearsal,
          hostModel: input.models.hostRehearsal,
          tableModel: input.models.tableRehearsal,
          judgeModel: input.models.rehearsalJudge,
          reason: 'deterministic_validation_failed',
        },
        blockingReasons: ['The means are unsupported.'],
      },
    })
    const importedInput = {
      ...input,
      source: { kind: 'storyline' as const, definition },
    }

    await expect(certifyStorylineWorkflow(importedInput)).resolves.toEqual({ status: 'failed', jobId: input.jobId })

    expect(draftStorylineStep).not.toHaveBeenCalled()
    expect(inspectStorylineStep).toHaveBeenCalledWith(definition)
    expect(failCertificationStep).toHaveBeenCalledWith(input.scope, input.jobId, expect.objectContaining({
      code: 'invalid_output',
      retryable: false,
      details: expect.objectContaining({
        attemptCount: 1,
        blockingReasons: [expect.objectContaining({ stage: 'deterministic_review' })],
      }),
    }))
  })
})
