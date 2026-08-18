import type { Story } from '../types.js'

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

  const eveningIds = new Set<string>()
  for (const stage of story.evening ?? []) {
    if (!stage.id.trim() || !stage.title.trim() || !stage.description.trim()) errors.push('evening stages require id, title and description')
    if (eveningIds.has(stage.id)) errors.push(`duplicate evening stage ${stage.id}`)
    if (!Number.isFinite(stage.durationMinutes) || stage.durationMinutes < 1) errors.push(`evening stage ${stage.id} needs a positive duration`)
    eveningIds.add(stage.id)
  }
  if ((story.evening ?? []).length < 4) errors.push('story needs a simple evening timeline with at least four stages')

  for (const character of story.characters) {
    if (characterIds.has(character.id)) errors.push(`duplicate character id ${character.id}`)
    characterIds.add(character.id)

    if (!character.invitationPretext?.trim()) errors.push(`character ${character.id} has no invitation pretext`)
    if (!character.invitationPromise?.trim()) errors.push(`character ${character.id} has no private invitation promise`)
    if (!character.privateIdentity?.trim()) errors.push(`character ${character.id} has no private identity`)
    if (!character.privateObjective?.trim()) errors.push(`character ${character.id} has no private objective`)
    if (character.goals?.length !== 3) errors.push(`character ${character.id} needs exactly three simple goals`)
    if (character.abilities?.length !== 2) errors.push(`character ${character.id} needs exactly two abilities`)
    if (!character.item?.title?.trim() || !character.item?.text?.trim()) errors.push(`character ${character.id} needs one playable item`)
    if (character.relationships?.length !== 2) errors.push(`character ${character.id} needs exactly two starting relationships`)
    if (!character.dilemma?.trim()) errors.push(`character ${character.id} needs one dilemma`)

    const goalIds = new Set<string>()
    for (const goal of character.goals ?? []) {
      if (!goal.id.trim() || !goal.title.trim() || !goal.text.trim()) errors.push(`character ${character.id} has an incomplete goal`)
      if (goalIds.has(goal.id)) errors.push(`character ${character.id} has duplicate goal ${goal.id}`)
      if (goal.points < 1) errors.push(`character ${character.id} goal ${goal.id} must be worth at least one point`)
      goalIds.add(goal.id)
    }

    const abilityIds = new Set<string>()
    for (const ability of character.abilities ?? []) {
      if (!ability.id.trim() || !ability.title.trim() || !ability.text.trim()) errors.push(`character ${character.id} has an incomplete ability`)
      if (abilityIds.has(ability.id)) errors.push(`character ${character.id} has duplicate ability ${ability.id}`)
      abilityIds.add(ability.id)
    }

    for (const relationship of character.relationships ?? []) {
      if (!relationship.roleId.trim() || !relationship.text.trim()) errors.push(`character ${character.id} has an incomplete relationship`)
      if (relationship.roleId === character.id) errors.push(`character ${character.id} cannot have a relationship with themselves`)
    }

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
  if (!story.premise?.trim()) errors.push('story premise is required')

  return errors
}

export function compileStory(story: Story): Story {
  const errors = validateStory(story)
  if (errors.length) throw new Error(`Invalid story:\n${errors.join('\n')}`)
  return story
}
