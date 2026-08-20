import type { SettingReference, SettingResourceKind, StorylineDefinition } from '../definition/contract'

export type SettingBacklinks = {
  reference: SettingReference
  resource: StorylineDefinition['setting'][SettingResourceKind][number]
  setupRequirements: StorylineDefinition['setupRequirements']
  clueDecks: StorylineDefinition['clueDecks']
  openingSteps: StorylineDefinition['story']['openingSteps']
}

export const settingResourceKinds: SettingResourceKind[] = [
  'playableSpaces',
  'routes',
  'usableFeatures',
  'availableProps',
  'safetyConstraints',
  'accessibilityNeeds',
  'contentBoundaries',
]

export function getSettingResource(definition: StorylineDefinition, reference: SettingReference) {
  return definition.setting[reference.kind].find(resource => resource.id === reference.id)
}

export function getSettingBacklinks(definition: StorylineDefinition): SettingBacklinks[] {
  return settingResourceKinds.flatMap(kind => definition.setting[kind].map(resource => {
    const reference: SettingReference = { kind, id: resource.id }
    return {
      reference,
      resource,
      setupRequirements: definition.setupRequirements.filter(requirement => requirement.settingRef.kind === kind && requirement.settingRef.id === resource.id),
      clueDecks: definition.clueDecks.filter(deck => deck.source.kind === kind && deck.source.id === resource.id),
      openingSteps: definition.story.openingSteps.filter(step => step.settingRefs.some(item => item.kind === kind && item.id === resource.id)),
    }
  }))
}
