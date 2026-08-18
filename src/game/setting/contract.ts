export type SettingQuestion = {
  id: keyof SettingBriefInput
  prompt: string
  why: string
  required: boolean
}

export type SettingBriefInput = {
  venueName?: string
  location?: string
  occasion?: string
  era?: string
  playableSpaces?: string[]
  routes?: string[]
  usableFeatures?: string[]
  availableProps?: string[]
  tone?: string
  safetyConstraints?: string[]
  accessibilityNeeds?: string[]
  contentBoundaries?: string[]
}

export type SettingBrief = {
  venueName: string
  location: string
  occasion: string
  era: string
  playableSpaces: string[]
  routes: string[]
  usableFeatures: string[]
  availableProps: string[]
  tone: string
  safetyConstraints: string[]
  accessibilityNeeds: string[]
  contentBoundaries: string[]
}
