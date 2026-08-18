import type { Story } from '../types.js'

export function validateStory(story: Story, purchasableEvidenceIds: ReadonlySet<string> = new Set()): string[] {
  const errors: string[] = []
  const characterIds = new Set(story.characters.map(character => character.id))
  const actionIds = new Set<string>()
  const storyEvidenceIds = new Set(story.publicEvidence.map(item => item.id))
  const evidenceIds = new Set([...storyEvidenceIds, ...purchasableEvidenceIds])
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

  if (characterIds.size !== story.characters.length) errors.push('character ids must be unique')

  const relationshipEdges = new Map<string, Set<string>>(story.characters.map(character => [character.id, new Set()]))
  const charactersWithOutgoingKnowledge = new Set<string>()
  const charactersWithIncomingKnowledge = new Set<string>()

  for (const character of story.characters) {

    if (!character.invitationPretext?.trim()) errors.push(`character ${character.id} has no invitation pretext`)
    if (!character.invitationPromise?.trim()) errors.push(`character ${character.id} has no private invitation promise`)
    if (!character.privateIdentity?.trim()) errors.push(`character ${character.id} has no private identity`)
    if (!character.privateObjective?.trim()) errors.push(`character ${character.id} has no private objective`)
    if ((character.traits ?? []).length < 2 || character.traits.some(trait => !trait.trim())) errors.push(`character ${character.id} needs at least two playable traits`)
    if (character.objectives?.length !== 3) errors.push(`character ${character.id} needs exactly three scored objectives`)
    if (!(character.relationships?.length > 0)) errors.push(`character ${character.id} needs at least one relationship`)
    if (!(character.secrets?.length > 0)) errors.push(`character ${character.id} needs secrets or evidence`)

    const objectiveIds = new Set<string>()
    for (const objective of character.objectives ?? []) {
      if (!objective.id.trim() || !objective.title.trim() || !objective.text.trim()) errors.push(`character ${character.id} has an incomplete objective`)
      if (objectiveIds.has(objective.id)) errors.push(`character ${character.id} has duplicate objective ${objective.id}`)
      if (![1, 2, 3].includes(objective.points)) errors.push(`character ${character.id} objective ${objective.id} must be worth 1, 2, or 3 points`)
      objectiveIds.add(objective.id)
    }

    for (const relationship of character.relationships ?? []) {
      if (!relationship.roleId.trim() || !relationship.text.trim()) errors.push(`character ${character.id} has an incomplete relationship`)
      if (relationship.roleId === character.id) errors.push(`character ${character.id} cannot have a relationship with themselves`)
      if (!characterIds.has(relationship.roleId)) errors.push(`character ${character.id} references missing relationship ${relationship.roleId}`)
      relationshipEdges.get(character.id)?.add(relationship.roleId)
      relationshipEdges.get(relationship.roleId)?.add(character.id)
    }

    for (const secret of character.secrets ?? []) {
      if (evidenceIds.has(secret.id)) errors.push(`duplicate evidence id ${secret.id}`)
      evidenceIds.add(secret.id)
      storyEvidenceIds.add(secret.id)
      if (secret.availableAfter && !declaredRunBeatIds.has(secret.availableAfter)) {
        errors.push(`secret ${secret.id} unlocks after missing run-plan beat ${secret.availableAfter}`)
      }
      for (const roleId of secret.aboutRoleIds ?? []) {
        if (!characterIds.has(roleId)) errors.push(`secret ${secret.id} references missing character ${roleId}`)
        if (roleId !== character.id) {
          charactersWithOutgoingKnowledge.add(character.id)
          charactersWithIncomingKnowledge.add(roleId)
          relationshipEdges.get(character.id)?.add(roleId)
          relationshipEdges.get(roleId)?.add(character.id)
        }
      }
    }

    for (const action of character.actions) {
      if (actionIds.has(action.id)) errors.push(`duplicate action id ${action.id}`)
      actionIds.add(action.id)
      if (action.essential && !action.beat) errors.push(`essential action ${action.id} has no canonical beat`)
    }
  }

  for (const character of story.characters) {
    if (!charactersWithOutgoingKnowledge.has(character.id)) errors.push(`character ${character.id} knows no secret about another suspect`)
    if (!charactersWithIncomingKnowledge.has(character.id)) errors.push(`no other suspect holds a secret about character ${character.id}`)
  }
  if (story.characters.length) {
    const visited = new Set<string>()
    const pending = [story.characters[0].id]
    while (pending.length) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      for (const neighbour of relationshipEdges.get(id) ?? []) pending.push(neighbour)
    }
    if (visited.size !== story.characters.length) errors.push('character secrets and relationships must form one connected social graph')
  }

  const timelineNumbers = story.timeline.map(item => item.beat)
  const expectedNumbers = story.timeline.map((_, index) => index + 1)
  if (timelineNumbers.some((beat, index) => beat !== expectedNumbers[index])) {
    errors.push('timeline beats must be contiguous and ordered from 1')
  }

  for (const beat of story.timeline) {
    if (new Set(beat.evidence.filter(id => storyEvidenceIds.has(id))).size < 2) errors.push(`timeline beat ${beat.beat} needs at least two non-purchasable evidence routes`)
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

export function compileStory(story: Story, purchasableEvidenceIds: ReadonlySet<string> = new Set()): Story {
  const errors = validateStory(story, purchasableEvidenceIds)
  if (errors.length) throw new Error(`Invalid story:\n${errors.join('\n')}`)
  return story
}
