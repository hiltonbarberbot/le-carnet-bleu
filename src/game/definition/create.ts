import { hashString } from '../random/hash'
import { createSettingBrief } from '../setting/brief'
import { compileStory, validateStory } from '../story/compile'
import type { Story } from '../types'
import type { SettingBrief } from '../setting/contract'
import type { SettingReference, StorylineDefinition, StorylineDefinitionInput } from './contract'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(input: Omit<StorylineDefinition, 'fingerprint'>) {
  const serialized = canonical(input)
  return ['a', 'b', 'c', 'd'].map(part => hashString(`definition:${part}:${serialized}`).toString(16).padStart(8, '0')).join('')
}

function findResource(setting: SettingBrief, kind: SettingReference['kind'], value: string) {
  const resources = setting[kind]
  return Array.isArray(resources) ? resources.find(resource => resource.id === value || resource.label === value) : undefined
}

function normalizeReference(reference: any, setting: SettingBrief): SettingReference {
  if (reference?.kind && reference?.id) return { kind: reference.kind, id: reference.id }
  const kind = reference?.settingField as SettingReference['kind']
  const value = kind === 'availableProps' ? reference?.propId || reference?.settingValue : reference?.settingValue
  const resource = kind && findResource(setting, kind, String(value ?? ''))
  return { kind, id: resource?.id ?? String(value ?? '') }
}

function normalizeLegacyInput(input: any, setting: SettingBrief): StorylineDefinitionInput {
  const setupRequirements: StorylineDefinitionInput['setupRequirements'] = (input.setupRequirements ?? []).map((item: any) => ({
    id: item.id,
    label: item.label,
    settingRef: normalizeReference(item.settingRef ?? item, setting),
  }))
  const requirementRefs = new Map(setupRequirements.map(item => [item.id, item.settingRef]))
  const rawStory = structuredClone(input.story)
  const solutionSteps = (rawStory.solutionSteps ?? []).map((step: any, index: number) => ({
    ...step,
    id: step.id || `solution-${index + 1}`,
  }))
  const solutionStepIds = solutionSteps.map((step: any) => step.id)
  const hostName = rawStory.host?.name ?? rawStory.victim ?? 'Host'
  const host = rawStory.host ?? { id: 'host', name: hostName, title: rawStory.hostRole ?? hostName }
  const culpritRoleId = rawStory.culpritRoleId
    ?? rawStory.characters.find((character: any) => character.name === rawStory.culprit)?.id
    ?? ''

  for (const character of rawStory.characters ?? []) {
    for (const secret of character.secrets ?? []) {
      secret.provenance ??= { source: { kind: 'role', roleId: character.id }, independenceGroup: `role:${character.id}` }
    }
  }
  for (const step of rawStory.openingSteps ?? []) {
    if (input.schemaVersion === 5 && typeof step.instruction === 'string' && !Array.isArray(step.instructions)) {
      const markers = rawStory.characters
        .map((character: any) => ({ character, marker: `${character.name}:` }))
        .filter(({ marker }: { marker: string }) => step.instruction.includes(marker))
      if (markers.length > 1) throw new Error(`Opening step ${step.id} contains instructions for several players in one legacy prose field.`)
      if (markers.length === 1) {
        const { character, marker } = markers[0]
        const markerIndex = step.instruction.indexOf(marker)
        const hostText = step.instruction.slice(0, markerIndex).trim()
        const playerText = step.instruction.slice(markerIndex + marker.length).trim()
        if (!hostText || !playerText) throw new Error(`Opening step ${step.id} cannot be separated into host and player instructions.`)
        step.instructions = [
          { recipientRoleId: host.id, text: hostText },
          { recipientRoleId: character.id, text: playerText },
        ]
      } else {
        const mentionedCharacter = rawStory.characters.find((character: any) => step.instruction.includes(character.name))
        if (mentionedCharacter) throw new Error(`Opening step ${step.id} mentions ${mentionedCharacter.name} but does not separate that player's instruction from host prose.`)
        step.instructions = [{ recipientRoleId: host.id, text: step.instruction.trim() }]
      }
      delete step.instruction
    }
    step.setupRequirementIds ??= [...new Set([
      ...(step.propIds ?? []).map((propId: string) => setupRequirements.find(item => item.settingRef.kind === 'availableProps' && item.settingRef.id === propId)?.id).filter(Boolean),
    ])]
    step.settingRefs ??= [
      ...step.setupRequirementIds.map((id: string) => requirementRefs.get(id)).filter(Boolean),
      ...(step.propIds ?? []).map((id: string) => ({ kind: 'availableProps', id })),
    ].filter((value: SettingReference, index: number, all: SettingReference[]) => all.findIndex(item => item.kind === value.kind && item.id === value.id) === index)
    step.propIds ??= step.settingRefs.filter((ref: SettingReference) => ref.kind === 'availableProps').map((ref: SettingReference) => ref.id)
    step.execution ??= step.propIds.length
      ? { kind: 'physical', contact: 'none', reversible: true, hostCued: true, proxy: 'host' }
      : { kind: 'spoken' }
  }
  for (const evidence of rawStory.publicEvidence ?? []) {
    const openingStepId = rawStory.openingSteps?.at(-1)?.id ?? ''
    evidence.provenance ??= { source: { kind: 'public', openingStepId }, independenceGroup: `opening:${openingStepId}` }
  }

  return {
    ...input,
    setting,
    story: {
      ...rawStory,
      host,
      victimRoleId: rawStory.victimRoleId ?? host.id,
      culpritRoleId,
      solutionSteps,
      solutionSummary: rawStory.solutionSummary ?? rawStory.solution,
    },
    acts: (input.acts ?? []).map((act: any) => ({ ...act, id: 'opening' as const })),
    setupRequirements,
    clueDecks: (input.clueDecks ?? []).map((deck: any) => ({
      id: deck.id,
      label: deck.label,
      source: normalizeReference(deck.source ?? deck, setting),
      clues: (deck.clues ?? []).map((clue: any) => ({
        ...clue,
        supportsSolutionStepIds: clue.supportsSolutionStepIds ?? solutionStepIds,
      })),
    })),
  }
}

export function settingReferenceExists(setting: SettingBrief, reference: SettingReference) {
  return Boolean(findResource(setting, reference.kind, reference.id))
}

function directReferenceKey(reference: SettingReference) {
  return `${reference.kind}:${reference.id}`
}

export function validateStorylineDefinition(input: StorylineDefinitionInput): string[] {
  const clueIds = new Set(input.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id)))
  const errors = validateStory(input.story, clueIds)
  if (!input.id.trim()) errors.push('definition id is required')
  if (!input.title.trim()) errors.push('definition title is required')
  if (input.story.characters.length !== 5 || input.story.totalPeople !== 6) errors.push('definition requires exactly five suspects and one host')

  if (input.clueDecks.length !== 2) errors.push('definition requires exactly two setting-derived clue decks')
  const deckIds = new Set<string>()
  const solutionStepIds = new Set(input.story.solutionSteps.map(step => step.id))
  let clueCount = 0
  for (const deck of input.clueDecks) {
    if (!deck.id.trim() || !deck.label.trim()) errors.push('clue decks require id and label')
    if (deckIds.has(deck.id)) errors.push(`duplicate clue deck ${deck.id}`)
    deckIds.add(deck.id)
    if (!settingReferenceExists(input.setting, deck.source)) errors.push(`clue deck ${deck.id} references missing ${directReferenceKey(deck.source)}`)
    if (!deck.clues.length) errors.push(`clue deck ${deck.id} is empty`)
    for (const clue of deck.clues) {
      clueCount += 1
      if (!clue.id.trim() || !clue.text.trim()) errors.push(`clue deck ${deck.id} contains an incomplete clue`)
      if (!clue.supportsSolutionStepIds.length) errors.push(`clue ${clue.id} supports no solution step`)
      for (const stepId of clue.supportsSolutionStepIds) if (!solutionStepIds.has(stepId)) errors.push(`clue ${clue.id} references missing solution step ${stepId}`)
    }
  }
  if (clueIds.size !== clueCount) errors.push('purchasable clue ids must be unique')
  if (clueCount !== input.story.characters.length) errors.push('definition requires exactly one unique purchasable clue per suspect')

  if (input.acts.length !== 1 || input.acts[0]?.id !== 'opening') errors.push('definition requires exactly one short authored opening before free play')
  for (const act of input.acts) {
    if (!act.title.trim() || !act.operatorGoal.trim() || !act.playerGoal.trim() || !act.completionLabel.trim()) errors.push('opening act requires title, operatorGoal, playerGoal and completionLabel')
    if (!Number.isFinite(act.durationMinutes) || act.durationMinutes < 1 || act.durationMinutes > 15) errors.push('opening act must last between one and fifteen minutes')
  }
  const investigationStages = input.story.evening.filter(stage => stage.phase === 'investigation')
  if (investigationStages.length !== 1) errors.push('evening requires exactly one continuous open investigation stage')
  const investigationMinutes = investigationStages[0]?.durationMinutes
  if (investigationMinutes && (investigationMinutes < 60 || investigationMinutes > 180)) errors.push('open investigation must be planned for one to three hours')

  const requirements = new Map<string, StorylineDefinitionInput['setupRequirements'][number]>()
  if (!input.setupRequirements.length) errors.push('definition requires at least one setting-backed setup requirement')
  for (const requirement of input.setupRequirements) {
    if (requirements.has(requirement.id)) errors.push(`duplicate setup requirement ${requirement.id}`)
    requirements.set(requirement.id, requirement)
    if (!requirement.id.trim() || !requirement.label.trim()) errors.push('setup requirements require id and label')
    if (!settingReferenceExists(input.setting, requirement.settingRef)) errors.push(`setup requirement ${requirement.id} references missing ${directReferenceKey(requirement.settingRef)}`)
  }

  for (const step of input.story.openingSteps) {
    const direct = new Set(step.settingRefs.map(directReferenceKey))
    for (const reference of step.settingRefs) if (!settingReferenceExists(input.setting, reference)) errors.push(`opening step ${step.id} references missing ${directReferenceKey(reference)}`)
    for (const requirementId of step.setupRequirementIds) if (!requirements.has(requirementId)) errors.push(`opening step ${step.id} references missing setup requirement ${requirementId}`)
    for (const requirementId of step.setupRequirementIds) {
      const reference = requirements.get(requirementId)?.settingRef
      if (reference && !direct.has(directReferenceKey(reference))) errors.push(`opening step ${step.id} omits direct crosslink ${directReferenceKey(reference)}`)
    }
    const propIds = step.settingRefs.filter(ref => ref.kind === 'availableProps').map(ref => ref.id)
    if (canonical(propIds) !== canonical(step.propIds)) errors.push(`opening step ${step.id} propIds must mirror its prop setting references`)
    if (step.execution.kind === 'physical' && !step.setupRequirementIds.length) errors.push(`physical opening step ${step.id} has no verified setup requirement`)
  }
  for (const evidence of [
    ...input.story.publicEvidence,
    ...input.story.characters.flatMap(character => character.secrets),
  ]) {
    const provenance = evidence.provenance
    if (!provenance) {
      errors.push(`evidence ${evidence.id} has no provenance`)
      continue
    }
    const expectedGroup = provenance.source.kind === 'role'
      ? `role:${provenance.source.roleId}`
      : provenance.source.kind === 'public'
        ? `opening:${provenance.source.openingStepId}`
        : `setting:${provenance.source.settingRef.kind}:${provenance.source.settingRef.id}`
    if (provenance.independenceGroup !== expectedGroup) errors.push(`evidence ${evidence.id} has unverifiable independence group ${provenance.independenceGroup}`)
    if (provenance.source.kind === 'setting' && !settingReferenceExists(input.setting, provenance.source.settingRef)) errors.push(`evidence ${evidence.id} references missing ${directReferenceKey(provenance.source.settingRef)}`)
  }
  return [...new Set(errors)]
}

export function createStorylineDefinition(rawInput: StorylineDefinitionInput | any): StorylineDefinition {
  const setting = createSettingBrief(rawInput.setting)
  const input = normalizeLegacyInput(rawInput, setting)
  const normalized: Omit<StorylineDefinition, 'fingerprint'> = {
    schemaVersion: 6,
    id: input.id.trim(),
    title: input.title.trim(),
    setting,
    story: compileStory(input.story, new Set(input.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id)))),
    clueDecks: structuredClone(input.clueDecks),
    acts: structuredClone(input.acts),
    setupRequirements: structuredClone(input.setupRequirements),
  }
  const errors = validateStorylineDefinition({ ...normalized, fingerprint: input.fingerprint })
  if (errors.length) throw new Error(`Invalid storyline definition:\n${errors.join('\n')}`)
  const expected = fingerprint(normalized)
  if (rawInput.schemaVersion === 6 && input.fingerprint && input.fingerprint !== expected) throw new Error('Storyline fingerprint does not match its content.')
  return { ...normalized, fingerprint: expected }
}
