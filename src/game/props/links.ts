import type { StorylineDefinition } from '../definition/contract'
import type { OpeningStep } from '../types'
import type { SettingProp } from '../setting/contract'
import { getSettingBacklinks } from '../setting/links'

export type PropBacklinks = {
  prop: SettingProp
  setupRequirements: StorylineDefinition['setupRequirements']
  openingSteps: OpeningStep[]
}

export function getPropBacklinks(definition: StorylineDefinition): PropBacklinks[] {
  return getSettingBacklinks(definition)
    .filter(entry => entry.reference.kind === 'availableProps' && (entry.setupRequirements.length > 0 || entry.openingSteps.length > 0))
    .map(entry => ({
      prop: entry.resource as SettingProp,
      setupRequirements: entry.setupRequirements,
      openingSteps: entry.openingSteps,
    }))
}
