import { createStorylineDefinition } from '../definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../definition/contract'
import { restoreGameState } from '../session/storage'
import type { ExistingGameState, GameState } from '../types'

export function validatePersistedStoryline(value: unknown): StorylineDefinition {
  if (!value || typeof value !== 'object') throw new Error('A storyline must be a JSON object.')
  return createStorylineDefinition(value as StorylineDefinitionInput)
}

export function validatePersistedGameState(
  storyline: StorylineDefinition,
  value: unknown,
): ExistingGameState {
  const envelope = JSON.stringify({
    formatVersion: 3,
    definition: storyline,
    state: value,
  })
  const state: GameState = restoreGameState(storyline, envelope)
  if (state.phase === 'idle') throw new Error('Only created game sessions can be persisted.')
  if (state.definitionFingerprint !== storyline.fingerprint) {
    throw new Error('Game and storyline fingerprints do not match.')
  }
  if (state.storyId !== storyline.story.id || state.seed !== storyline.story.seed) {
    throw new Error('Game does not belong to this storyline.')
  }
  return state
}
