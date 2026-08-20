import type { StorylineDefinitionInput } from '../../definition/contract'
import { createStorylineDefinition } from '../../definition/create'
import laColombe from '../../../../story/runs/grief-of-the-dove/story.json'

export function createLaColombeStoryline() {
  return createStorylineDefinition(laColombe as unknown as StorylineDefinitionInput)
}
