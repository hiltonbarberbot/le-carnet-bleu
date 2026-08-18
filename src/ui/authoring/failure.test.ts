import { describe, expect, it } from 'vitest'
import { AiRequestError } from '../../game/ai/problem'
import { describeDraftFailure } from './failure'

describe('authoring failure copy', () => {
  it('names the stage and gives a useful next action for rejected story output', () => {
    const error = new AiRequestError({
      error: 'The AI story did not pass the checks.',
      code: 'invalid_output',
      retryable: true,
      reference: 'ABC12345',
    }, 502)

    expect(describeDraftFailure(error, 'story')).toEqual({
      title: 'The story didn’t pass our checks',
      message: 'The AI returned a draft, but it was not yet fair and playable enough to use.',
      help: 'Try again. Your seed is still here and the rejected draft was not saved.',
      stage: 'story',
      retryable: true,
      reference: 'ABC12345',
    })
  })
})
