import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { demoSetting } from '../../src/game/demo'
import { createSettingBrief } from '../../src/game/setting/brief'
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
})
