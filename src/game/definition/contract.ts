import type { SettingBrief } from '../setting/contract.js'
import type { Story } from '../types.js'

export type ActDefinition = {
  id: 'opening'
  title: string
  operatorGoal: string
  playerGoal: string
  durationMinutes: number
  completionLabel: string
}

export type SettingResourceKind = keyof Pick<SettingBrief,
  | 'playableSpaces'
  | 'routes'
  | 'usableFeatures'
  | 'availableProps'
  | 'safetyConstraints'
  | 'accessibilityNeeds'
  | 'contentBoundaries'
>

export type SettingReference = {
  kind: SettingResourceKind
  id: string
}

export type SetupRequirement = {
  id: string
  label: string
  settingRef: SettingReference
}

export type ClueCard = {
  id: string
  text: string
  supportsSolutionStepIds: string[]
}

export type ClueDeck = {
  id: string
  label: string
  source: SettingReference
  clues: ClueCard[]
}

/** A validated, reusable mystery that can be instantiated as many games. */
export type StorylineDefinition = {
  schemaVersion: 5
  id: string
  title: string
  fingerprint: string
  setting: SettingBrief
  story: Story
  clueDecks: ClueDeck[]
  acts: ActDefinition[]
  setupRequirements: SetupRequirement[]
}

export type StorylineDefinitionInput = {
  id: string
  title: string
  fingerprint?: string
  setting: SettingBrief
  story: Story
  clueDecks: ClueDeck[]
  acts: ActDefinition[]
  setupRequirements: SetupRequirement[]
}

/** @deprecated Use StorylineDefinition. */
export type GameDefinition = StorylineDefinition

/** @deprecated Use StorylineDefinitionInput. */
export type GameDefinitionInput = StorylineDefinitionInput
