import type { StorylineDefinition } from '../../definition/contract'

export function auditStorylineLogicStatically(definition: StorylineDefinition): string[] {
  const errors: string[] = []
  const stepIds = new Set(definition.story.solutionSteps.map(step => step.id))
  const evidence = new Map([
    ...definition.story.publicEvidence.map(item => [item.id, item] as const),
    ...definition.story.characters.flatMap(character => character.secrets.map(item => [item.id, item] as const)),
  ])

  const theory = definition.story.caseTheory
  if (!theory) {
    errors.push('story has no explicit caseTheory crosslinks for motive, means, opportunity, and act')
  } else {
    const core = [theory.motiveStepId, theory.meansStepId, theory.opportunityStepId, theory.actStepId]
    if (new Set(core).size !== core.length) errors.push('caseTheory motive, means, opportunity, and act must link to four distinct atomic solution steps')
    for (const [facet, stepId] of Object.entries(theory)) {
      if (stepId && !stepIds.has(stepId)) errors.push(`caseTheory ${facet} references missing solution step ${stepId}`)
    }
  }

  for (const step of definition.story.solutionSteps) {
    const nonCulpritGroups = new Set<string>()
    const culpritEvidenceIds: string[] = []
    for (const evidenceId of step.evidence) {
      const provenance = evidence.get(evidenceId)?.provenance
      if (!provenance) continue
      if (provenance.source.kind === 'role' && provenance.source.roleId === definition.story.culpritRoleId) culpritEvidenceIds.push(evidenceId)
      else nonCulpritGroups.add(provenance.independenceGroup)
    }
    if (culpritEvidenceIds.length) errors.push(`solution step ${step.id} cites culprit-only evidence as proof: ${culpritEvidenceIds.join(', ')}`)
    if (nonCulpritGroups.size < 2) errors.push(`solution step ${step.id} needs two independent non-culprit proof sources; found ${nonCulpritGroups.size}`)
  }

  return [...new Set(errors)]
}
