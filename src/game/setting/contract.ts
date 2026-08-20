export type SettingQuestion = {
  id: keyof SettingBriefInput
  prompt: string
  why: string
  required: boolean
}

export type SettingResourceInput = string | {
  id?: string
  label: string
  description?: string
}

export type SettingResource = {
  id: string
  label: string
  description: string
}

export type SettingRouteInput = SettingResourceInput | {
  id?: string
  label: string
  description?: string
  spaceIds?: string[]
  accessibilityNotes?: string[]
}

export type SettingRoute = SettingResource & {
  spaceIds: string[]
  accessibilityNotes: string[]
}

export type SettingFeatureInput = SettingResourceInput | {
  id?: string
  label: string
  description?: string
  spaceIds?: string[]
}

export type SettingFeature = SettingResource & {
  spaceIds: string[]
}

export type SettingPropInput = string | {
  id?: string
  label: string
  description?: string
  quantity?: number
  safetyNotes?: string[]
}

export type SettingProp = {
  id: string
  label: string
  description: string
  quantity: number
  safetyNotes: string[]
}

export type SettingBriefInput = {
  venueName?: string
  location?: string
  era?: string
  playableSpaces?: SettingResourceInput[]
  routes?: SettingRouteInput[]
  usableFeatures?: SettingFeatureInput[]
  availableProps?: SettingPropInput[]
  tone?: string
  safetyConstraints?: SettingResourceInput[]
  accessibilityNeeds?: SettingResourceInput[]
  contentBoundaries?: SettingResourceInput[]
}

export type SettingBrief = {
  venueName: string
  location: string
  era: string
  playableSpaces: SettingResource[]
  routes: SettingRoute[]
  usableFeatures: SettingFeature[]
  availableProps: SettingProp[]
  tone: string
  safetyConstraints: SettingResource[]
  accessibilityNeeds: SettingResource[]
  contentBoundaries: SettingResource[]
}
