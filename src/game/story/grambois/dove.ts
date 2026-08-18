import type { StorylineDefinitionInput } from '../../definition/contract.js'
import { createStorylineDefinition } from '../../definition/create.js'
import laColombe from '../../../../story/runs/grief-of-the-dove/story.json'

export function createLaColombeStoryline() {
  return createStorylineDefinition(laColombe as unknown as StorylineDefinitionInput)
}
