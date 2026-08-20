import type { StorylineDefinition } from '../definition/contract.js'
import type { OpeningStep } from '../types.js'
import type { SettingProp } from '../setting/contract.js'
import { getSettingBacklinks } from '../setting/links.js'

export type PropBacklinks = {
  prop: SettingProp
  setupRequirements: StorylineDefinition['setupRequirements']
  openingSteps: OpeningStep[]
}

export function getPropBacklinks(definition: StorylineDefinition): PropBacklinks[] {
  return getSettingBacklinks(definition).filter(entry => entry.reference.kind === 'availableProps').map(entry => ({
    prop: entry.resource as SettingProp,
    setupRequirements: entry.setupRequirements,
    openingSteps: entry.openingSteps,
  }))
}
