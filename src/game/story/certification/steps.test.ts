import { describe, expect, it, vi } from 'vitest'
import { RetryableError } from 'workflow'
import { authorStorylineAttempt } from '../../ai/server/author'
import { createDemoStoryline, demoSetting } from '../../demo'
import { createSettingBrief } from '../../setting/brief'
import { draftStorylineStep } from './steps'

vi.mock('../../ai/server/author', () => ({ authorStorylineAttempt: vi.fn() }))

const setting = createSettingBrief(demoSetting)

describe('durable authoring step', () => {
  it('retries malformed model output inside the same semantic authoring attempt', async () => {
    vi.mocked(authorStorylineAttempt).mockResolvedValue({
      status: 'rejected',
      kind: 'malformed',
      reason: 'Unexpected end of JSON input',
    })

    await expect(draftStorylineStep(setting, 1, 'Repair the evidence graph.')).rejects.toSatisfy(error => (
      RetryableError.is(error)
    ))
    expect(draftStorylineStep.maxRetries).toBe(2)
  })

  it('returns structural invalidity so the workflow consumes a semantic repair attempt', async () => {
    const rejection = {
      status: 'rejected' as const,
      kind: 'invalid_definition' as const,
      reason: 'The culprit has no independent means evidence.',
    }
    vi.mocked(authorStorylineAttempt).mockResolvedValue(rejection)

    await expect(draftStorylineStep(setting, 0)).resolves.toEqual(rejection)
  })

  it('returns a valid authored definition unchanged', async () => {
    const drafted = { status: 'drafted' as const, definition: createDemoStoryline('step-pass') }
    vi.mocked(authorStorylineAttempt).mockResolvedValue(drafted)

    await expect(draftStorylineStep(setting, 0)).resolves.toEqual(drafted)
  })
})
