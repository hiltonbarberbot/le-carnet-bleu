import type { Story } from '../types.js'

export function validateStory(story: Story, purchasableEvidenceIds: ReadonlySet<string> = new Set()): string[] {
  const errors: string[] = []
  const characterIds = new Set(story.characters.map(character => character.id))
  const storyEvidenceIds = new Set(story.publicEvidence.map(item => item.id))
  const evidenceIds = new Set([...storyEvidenceIds, ...purchasableEvidenceIds])
  const openingStepIds = new Set<string>()
  const evidenceProvenance = new Map(story.publicEvidence.map(item => [item.id, item.provenance] as const))

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
  if (characterIds.has(story.host.id)) errors.push(`host role id ${story.host.id} collides with a guest role`)

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
      const provenance = secret.provenance ?? { source: { kind: 'role' as const, roleId: character.id }, independenceGroup: `role:${character.id}` }
      evidenceProvenance.set(secret.id, provenance)
      if (!provenance.independenceGroup.trim()) errors.push(`evidence ${secret.id} needs an independence group`)
      if (provenance.source.kind === 'role' && !characterIds.has(provenance.source.roleId)) errors.push(`evidence ${secret.id} references missing source role ${provenance.source.roleId}`)
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

  const solutionStepIds = new Set<string>()
  for (const [index, step] of story.solutionSteps.entries()) {
    if (!step.id.trim()) errors.push(`solution step ${index + 1} needs an id`)
    if (solutionStepIds.has(step.id)) errors.push(`duplicate solution step ${step.id}`)
    solutionStepIds.add(step.id)
    if (!step.title.trim() || !step.truth.trim()) errors.push(`solution step ${index + 1} is incomplete`)
    const independentRoutes = new Set(step.evidence.filter(id => storyEvidenceIds.has(id)).map(id => evidenceProvenance.get(id)?.independenceGroup).filter(Boolean))
    if (independentRoutes.size < 2) errors.push(`solution step ${index + 1} needs at least two independent non-purchasable evidence routes`)
    for (const evidenceId of step.evidence) {
      if (!evidenceIds.has(evidenceId)) errors.push(`solution step ${index + 1} references missing evidence ${evidenceId}`)
    }
  }

  for (const step of story.openingSteps) {
    if (openingStepIds.has(step.id)) errors.push(`duplicate opening step id ${step.id}`)
    openingStepIds.add(step.id)
    if (!step.id.trim() || !step.title.trim() || !step.trigger.trim() || !step.instruction.trim()) {
      errors.push('opening steps require id, title, trigger and instruction')
    }
  }

  for (const evidence of story.publicEvidence) {
    if (!evidence.provenance) continue
    if (!evidence.provenance.independenceGroup.trim()) errors.push(`evidence ${evidence.id} needs an independence group`)
    if (evidence.provenance.source.kind === 'public' && !openingStepIds.has(evidence.provenance.source.openingStepId)) errors.push(`evidence ${evidence.id} references missing opening step ${evidence.provenance.source.openingStepId}`)
  }

  if (story.host.id !== story.victimRoleId) errors.push('the victim role must be the host role')
  if (!story.characters.some(character => character.id === story.culpritRoleId)) errors.push(`culprit role ${story.culpritRoleId} is not a guest character`)
  if (!story.host.id.trim() || !story.host.name.trim() || !story.host.title.trim()) errors.push('host role requires id, name and title')
  if (!story.premise?.trim()) errors.push('story premise is required')
  if (!story.solutionSummary?.trim()) errors.push('story solution summary is required')

  return errors
}

export function compileStory(story: Story, purchasableEvidenceIds: ReadonlySet<string> = new Set()): Story {
  const errors = validateStory(story, purchasableEvidenceIds)
  if (errors.length) throw new Error(`Invalid story:\n${errors.join('\n')}`)
  return story
}
