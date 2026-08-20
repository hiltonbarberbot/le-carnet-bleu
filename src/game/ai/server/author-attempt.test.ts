import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { demoSetting } from '../../demo'
import { createSettingBrief } from '../../setting/brief'
import { authorStorylineAttempt } from './author'

vi.mock('ai', () => ({ streamText: vi.fn() }))

const setting = createSettingBrief(demoSetting)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('storyline authoring attempt classification', () => {
  it('classifies unreadable model JSON as malformed transport output', async () => {
    vi.mocked(streamText).mockReturnValue({ text: Promise.resolve('{"id":"unfinished"') } as never)

    await expect(authorStorylineAttempt(setting, 0)).resolves.toEqual(expect.objectContaining({
      status: 'rejected',
      kind: 'malformed',
    }))
  })

  it('classifies readable JSON that violates the game contract as an invalid definition', async () => {
    vi.mocked(streamText).mockReturnValue({ text: Promise.resolve('{}') } as never)

    await expect(authorStorylineAttempt(setting, 0)).resolves.toEqual(expect.objectContaining({
      status: 'rejected',
      kind: 'invalid_definition',
    }))
  })

  it('gives a repair attempt structured findings instead of flattened review prose', async () => {
    vi.mocked(streamText).mockReturnValue({ text: Promise.resolve('{}') } as never)

    await authorStorylineAttempt(setting, 1, {
      schemaVersion: 1,
      findings: [{
        stage: 'independent_review',
        code: 'culprit_only_proof',
        message: 'The fatal act is known only by the culprit.',
        relatedIds: ['fatal-act', 'culprit-role'],
      }],
    })

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('"code": "culprit_only_proof"'),
    }))
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('"relatedIds"'),
    }))
  })
})
