import type { SettingBriefInput } from '../../setting/contract'

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : []
}

function cleanResources(value: unknown): NonNullable<SettingBriefInput['playableSpaces']> {
  if (!Array.isArray(value)) return []
  return value.flatMap<NonNullable<SettingBriefInput['playableSpaces']>[number]>(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const resource = item as Record<string, unknown>
    const label = cleanText(resource.label)
    return label ? [{ id: cleanText(resource.id) || undefined, label, description: cleanText(resource.description) }] : []
  })
}

function cleanRoutes(value: unknown): NonNullable<SettingBriefInput['routes']> {
  if (!Array.isArray(value)) return []
  return value.flatMap<NonNullable<SettingBriefInput['routes']>[number]>(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const route = item as Record<string, unknown>
    const label = cleanText(route.label)
    return label ? [{
      id: cleanText(route.id) || undefined,
      label,
      description: cleanText(route.description),
      spaceIds: cleanList(route.spaceIds),
      accessibilityNotes: cleanList(route.accessibilityNotes),
    }] : []
  })
}

function cleanFeatures(value: unknown): NonNullable<SettingBriefInput['usableFeatures']> {
  if (!Array.isArray(value)) return []
  return value.flatMap<NonNullable<SettingBriefInput['usableFeatures']>[number]>(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const feature = item as Record<string, unknown>
    const label = cleanText(feature.label)
    return label ? [{
      id: cleanText(feature.id) || undefined,
      label,
      description: cleanText(feature.description),
      spaceIds: cleanList(feature.spaceIds),
    }] : []
  })
}

function cleanProps(value: unknown): NonNullable<SettingBriefInput['availableProps']> {
  if (!Array.isArray(value)) return []
  return value.flatMap<NonNullable<SettingBriefInput['availableProps']>[number]>(item => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const prop = item as Record<string, unknown>
    const label = cleanText(prop.label)
    return label ? [{
      id: cleanText(prop.id) || undefined,
      label,
      description: cleanText(prop.description),
      quantity: typeof prop.quantity === 'number' ? prop.quantity : 1,
      safetyNotes: cleanList(prop.safetyNotes),
    }] : []
  })
}

export function normalizeSettingDraft(value: unknown): SettingBriefInput {
  const setting = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    venueName: cleanText(setting.venueName),
    location: cleanText(setting.location),
    era: cleanText(setting.era),
    playableSpaces: cleanResources(setting.playableSpaces),
    routes: cleanRoutes(setting.routes),
    usableFeatures: cleanFeatures(setting.usableFeatures),
    availableProps: cleanProps(setting.availableProps),
    tone: cleanText(setting.tone),
    safetyConstraints: cleanResources(setting.safetyConstraints),
    accessibilityNeeds: cleanResources(setting.accessibilityNeeds),
    contentBoundaries: cleanResources(setting.contentBoundaries),
  }
}
