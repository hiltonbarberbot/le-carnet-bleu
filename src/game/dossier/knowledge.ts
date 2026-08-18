import type { Character, Story } from '../types'

export function getKnownMemories(character: Character, completedBeatIds: readonly string[] = []) {
  const completed = new Set(completedBeatIds)
  return character.memories.filter(memory => !memory.availableAfter || completed.has(memory.availableAfter))
}

export function getMemoriesBeforeAction(story: Story, character: Character, actionId: string) {
  const actionBeatIndex = story.runPlan.findIndex(beat => beat.actionIds.includes(actionId))
  if (actionBeatIndex < 0) return getKnownMemories(character)
  return getKnownMemories(character, story.runPlan.slice(0, actionBeatIndex).map(beat => beat.id))
}
