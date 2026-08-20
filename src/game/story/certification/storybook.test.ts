import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  certifyStorylineStep,
  draftStorylineStep,
  failCertificationStep,
  markCertificationRunning,
} from './steps'
import { certifyStorylineWorkflow } from './storybook'
import { demoSetting } from '../../demo'
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
  reviewStorylineStep: vi.fn(),
}))

const input = {
  jobId: '22222222-2222-4222-8222-222222222222',
  scope: { ownerId: 'owner-a' },
  setting: createSettingBrief(demoSetting),
  models: {
    author: 'author/model',
    review: 'review/model',
    roleRehearsal: 'role/model',
    hostRehearsal: 'host/model',
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
    expect(draftStorylineStep).toHaveBeenNthCalledWith(2, input.setting, 1, 'The means are unsupported.')
    expect(certifyStorylineStep).not.toHaveBeenCalled()
    expect(failCertificationStep).toHaveBeenCalledWith(input.scope, input.jobId, expect.objectContaining({
      code: 'invalid_output',
    }))
  })
})
