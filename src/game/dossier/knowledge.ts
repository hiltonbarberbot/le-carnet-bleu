import type { Character, Story } from '../types'

export function getKnownMemories(character: Character, completedBeatIds: readonly string[] = []) {
  const completed = new Set(completedBeatIds)
  return character.memories.filter(memory => !memory.availableAfter || completed.has(memory.availableAfter))
}

export function getMemoriesBeforeAction(story: Story, character: Character, actionId: string) {
  const actionBeat = story.runPlan.find(beat => beat.actionIds.includes(actionId))
  if (!actionBeat) return getKnownMemories(character)

  const completed = new Set<string>()
  function collectDependencies(beatId: string) {
    const beat = story.runPlan.find(item => item.id === beatId)
    if (!beat) return
    for (const dependency of beat.dependsOn) {
      if (completed.has(dependency)) continue
      completed.add(dependency)
      collectDependencies(dependency)
    }
  }
  collectDependencies(actionBeat.id)
  return getKnownMemories(character, [...completed])
}
