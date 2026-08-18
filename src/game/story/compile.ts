import type { Story } from '../types'

export function validateStory(story: Story): string[] {
  const errors: string[] = []
  const characterIds = new Set<string>()
  const actionIds = new Set<string>()
  const evidenceIds = new Set(story.publicEvidence.map(item => item.id))
  const runBeatIds = new Set<string>()
  const declaredRunBeatIds = new Set(story.runPlan.map(beat => beat.id))

  if (story.totalPeople !== story.characters.length + 1) {
    errors.push(`story requires ${story.characters.length} guests plus one host, but totalPeople is ${story.totalPeople}`)
  }

  for (const character of story.characters) {
    if (characterIds.has(character.id)) errors.push(`duplicate character id ${character.id}`)
    characterIds.add(character.id)

    for (const memory of character.memories) {
      if (evidenceIds.has(memory.id)) errors.push(`duplicate evidence id ${memory.id}`)
      evidenceIds.add(memory.id)
      if (memory.availableAfter && !declaredRunBeatIds.has(memory.availableAfter)) {
        errors.push(`memory ${memory.id} unlocks after missing run-plan beat ${memory.availableAfter}`)
      }
    }

    for (const action of character.actions) {
      if (actionIds.has(action.id)) errors.push(`duplicate action id ${action.id}`)
      actionIds.add(action.id)
      if (action.essential && !action.beat) errors.push(`essential action ${action.id} has no canonical beat`)
    }
  }

  const timelineNumbers = story.timeline.map(item => item.beat)
  const expectedNumbers = story.timeline.map((_, index) => index + 1)
  if (timelineNumbers.some((beat, index) => beat !== expectedNumbers[index])) {
    errors.push('timeline beats must be contiguous and ordered from 1')
  }

  for (const beat of story.timeline) {
    if (beat.evidence.length < 2) errors.push(`timeline beat ${beat.beat} needs at least two evidence routes`)
    for (const evidenceId of beat.evidence) {
      if (!evidenceIds.has(evidenceId)) errors.push(`timeline beat ${beat.beat} references missing evidence ${evidenceId}`)
    }
  }

  for (const beat of story.runPlan) {
    if (runBeatIds.has(beat.id)) errors.push(`duplicate run-plan beat id ${beat.id}`)
    runBeatIds.add(beat.id)
    for (const actionId of beat.actionIds) {
      if (!actionIds.has(actionId)) errors.push(`run-plan beat ${beat.id} references missing action ${actionId}`)
    }
  }

  const seenRunBeats = new Set<string>()
  for (const beat of story.runPlan) {
    for (const dependency of beat.dependsOn) {
      if (!seenRunBeats.has(dependency)) errors.push(`run-plan beat ${beat.id} depends on unavailable earlier beat ${dependency}`)
    }
    seenRunBeats.add(beat.id)
  }

  const plannedActions = new Set(story.runPlan.flatMap(beat => beat.actionIds))
  for (const character of story.characters) {
    for (const action of character.actions) {
      if (action.essential && !plannedActions.has(action.id)) {
        errors.push(`essential action ${action.id} is absent from the run plan`)
      }
    }
  }

  if (!story.characters.some(character => character.name === story.culprit)) {
    errors.push(`culprit ${story.culprit} is not a guest character`)
  }

  return errors
}

export function compileStory(story: Story): Story {
  const errors = validateStory(story)
  if (errors.length) throw new Error(`Invalid story:\n${errors.join('\n')}`)
  return story
}
