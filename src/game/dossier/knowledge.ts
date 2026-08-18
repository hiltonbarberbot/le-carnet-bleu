import type { Character, Story } from '../types.js'

export function getKnownMemories(character: Character, completedBeatIds: readonly string[] = []) {
  const completed = new Set(completedBeatIds)
  return character.memories.filter(memory => !memory.availableAfter || completed.has(memory.availableAfter))
}

export function getMemoriesBeforeAction(story: Story, character: Character, actionId: string) {
  const actionBeat = story.runPlan.find(beat => beat.actionIds.includes(actionId))
  if (!actionBeat) return getKnownMemories(character)

  const beatsById = new Map(story.runPlan.map(beat => [beat.id, beat]))
  const completed = new Set<string>()
  const pending = [...actionBeat.dependsOn]
  while (pending.length) {
    const beatId = pending.pop()!
    if (completed.has(beatId)) continue
    completed.add(beatId)
    const beat = beatsById.get(beatId)
    if (beat) pending.push(...beat.dependsOn)
  }
  return getKnownMemories(character, [...completed])
}
