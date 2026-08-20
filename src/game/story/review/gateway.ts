import { generateText, jsonSchema, Output } from 'ai'
import { createAiCallOptions } from '../../ai/server/deadline'
import type { StorylineDefinition } from '../../definition/contract'
import {
  createStoryLogicReviewPrompt,
  storyLogicReviewJsonSchema,
  validateStoryLogicReview,
  type StoryLogicReview,
} from './contract'

export const defaultLogicReviewModel = 'anthropic/claude-sonnet-5'

export async function reviewStorylineLogic(
  definition: StorylineDefinition,
  options: { model?: string } = {},
): Promise<StoryLogicReview> {
  const result = await generateText({
    model: options.model ?? process.env.AI_GATEWAY_REVIEW_MODEL ?? defaultLogicReviewModel,
    system: 'You are the final independent fair-play editor. Be severe, specific, and internally consistent. Return only the requested structured review.',
    prompt: createStoryLogicReviewPrompt(definition),
    output: Output.object({ schema: jsonSchema<StoryLogicReview>(storyLogicReviewJsonSchema) }),
    ...createAiCallOptions(),
    temperature: 0,
    providerOptions: { gateway: { tags: ['le-carnet-bleu', 'story-logic-review'] } },
  })
  const review = result.output
  const errors = validateStoryLogicReview(definition, review)
  if (errors.length) throw new Error(`Invalid story logic review:\n${errors.join('\n')}`)
  return review
}
