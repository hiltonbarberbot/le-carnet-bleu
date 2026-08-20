import type { SettingBrief, SettingBriefInput, SettingQuestion, SettingResourceInput } from './contract'

export const settingQuestions: SettingQuestion[] = [
  {
    id: 'venueName',
    prompt: 'What is the real venue called, and what kind of place is it?',
    why: 'The fiction should grow from the actual place rather than replace it with an invented mansion.',
    required: true,
  },
  {
    id: 'location',
    prompt: 'Where is the venue, and which local details should the story use?',
    why: 'Location supplies atmosphere, history, weather, and believable reasons for gathering.',
    required: true,
  },
  {
    id: 'era',
    prompt: 'Should the fiction be present-day, historical, timeless, or another specific era?',
    why: 'Technology, social rules, costumes, and evidence all depend on the era.',
    required: true,
  },
  {
    id: 'playableSpaces',
    prompt: 'Which rooms or outdoor areas may be used during play?',
    why: 'Every staged movement must use a real, permitted space.',
    required: true,
  },
  {
    id: 'routes',
    prompt: 'How can players safely move between those spaces, and which routes are off-limits?',
    why: 'Means and opportunity must be physically playable without inventing doors, terraces, or passages.',
    required: true,
  },
  {
    id: 'usableFeatures',
    prompt: 'Which real features could become clues or story elements?',
    why: 'Architecture, views, furniture, lighting, and local objects make the mystery specific.',
    required: false,
  },
  {
    id: 'availableProps',
    prompt: 'Which costumes and safe props already exist or can easily be prepared?',
    why: 'The run plan must not depend on unavailable or unsafe objects.',
    required: false,
  },
  {
    id: 'tone',
    prompt: 'What tone should the evening have?',
    why: 'The same setting can support serious intrigue, warm comedy, gothic suspense, or social satire.',
    required: true,
  },
  {
    id: 'safetyConstraints',
    prompt: 'What physical, privacy, timing, or venue rules must never be crossed?',
    why: 'Physical staging must be designed around real safety rather than patched afterward.',
    required: true,
  },
  {
    id: 'accessibilityNeeds',
    prompt: 'Does anyone need seated play, step-free routes, larger text, lower sensory load, or another accommodation?',
    why: 'Essential staging must be playable by the people actually attending.',
    required: false,
  },
  {
    id: 'contentBoundaries',
    prompt: 'Which themes, relationships, or kinds of harm should the story avoid?',
    why: 'Private secrets and motives should create tension without crossing the group’s boundaries.',
    required: true,
  },
]

function cleanText(value: string | undefined) {
  return value?.trim() ?? ''
}

function cleanList(value: string[] | undefined) {
  return [...new Set((value ?? []).map(item => item.trim()).filter(Boolean))]
}

function resourceId(label: string) {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cleanResources(value: SettingResourceInput[] | undefined) {
  return (value ?? []).map(item => {
    const input = typeof item === 'string' ? { label: item } : item
    const label = cleanText(input.label)
    return { id: cleanText(input.id) || resourceId(label), label, description: cleanText(input.description) }
  }).filter(resource => resource.label)
}

function cleanRoutes(value: SettingBriefInput['routes']): SettingBrief['routes'] {
  return (value ?? []).map(item => {
    const input = typeof item === 'string' ? { label: item } : item
    const label = cleanText(input.label)
    return {
      id: cleanText(input.id) || resourceId(label),
      label,
      description: cleanText(input.description),
      spaceIds: cleanList('spaceIds' in input ? input.spaceIds as string[] | undefined : undefined),
      accessibilityNotes: cleanList('accessibilityNotes' in input ? input.accessibilityNotes as string[] | undefined : undefined),
    }
  }).filter(resource => resource.label)
}

function cleanFeatures(value: SettingBriefInput['usableFeatures']): SettingBrief['usableFeatures'] {
  return (value ?? []).map(item => {
    const input = typeof item === 'string' ? { label: item } : item
    const label = cleanText(input.label)
    return {
      id: cleanText(input.id) || resourceId(label),
      label,
      description: cleanText(input.description),
      spaceIds: cleanList('spaceIds' in input ? input.spaceIds as string[] | undefined : undefined),
    }
  }).filter(resource => resource.label)
}

function cleanProps(value: SettingBriefInput['availableProps']): SettingBrief['availableProps'] {
  return (value ?? []).map(item => {
    const input = typeof item === 'string' ? { label: item } : item
    const label = cleanText(input.label)
    return {
      id: cleanText(input.id) || resourceId(label),
      label,
      description: cleanText(input.description),
      quantity: input.quantity ?? 1,
      safetyNotes: cleanList(input.safetyNotes),
    }
  }).filter(prop => prop.label)
}

export function getSettingBriefBlockers(input: SettingBriefInput): string[] {
  const blockers: string[] = []
  for (const question of settingQuestions.filter(item => item.required)) {
    const value = input[question.id]
    const missing = Array.isArray(value)
      ? value.every(item => typeof item === 'string' ? !item.trim() : !cleanText(item.label))
      : !cleanText(value)
    if (missing) blockers.push(question.prompt)
  }
  const spaces = cleanResources(input.playableSpaces)
  if (spaces.length === 1) {
    blockers.push('Name at least two playable areas, or describe how one area can safely change function during the evening.')
  }
  const props = cleanProps(input.availableProps)
  const propIds = new Set<string>()
  for (const prop of props) {
    if (!prop.id) blockers.push(`Give “${prop.label}” a stable prop id.`)
    if (propIds.has(prop.id)) blockers.push(`Use a unique prop id instead of “${prop.id}” more than once.`)
    if (!Number.isInteger(prop.quantity) || prop.quantity < 1) blockers.push(`Give prop “${prop.id}” a positive whole-number quantity.`)
    propIds.add(prop.id)
  }
  for (const [kind, resources] of Object.entries({
    playableSpaces: spaces,
    routes: cleanRoutes(input.routes),
    usableFeatures: cleanFeatures(input.usableFeatures),
    safetyConstraints: cleanResources(input.safetyConstraints),
    accessibilityNeeds: cleanResources(input.accessibilityNeeds),
    contentBoundaries: cleanResources(input.contentBoundaries),
  })) {
    const ids = new Set<string>()
    for (const resource of resources) {
      if (ids.has(resource.id)) blockers.push(`Use a unique ${kind} id instead of “${resource.id}” more than once.`)
      ids.add(resource.id)
    }
  }
  const spaceIds = new Set(spaces.map(space => space.id))
  for (const resource of [...cleanRoutes(input.routes), ...cleanFeatures(input.usableFeatures)]) {
    for (const spaceId of resource.spaceIds) if (!spaceIds.has(spaceId)) blockers.push(`${resource.id} references missing playable space ${spaceId}.`)
  }
  return blockers
}

export function createSettingBrief(input: SettingBriefInput): SettingBrief {
  const blockers = getSettingBriefBlockers(input)
  if (blockers.length) throw new Error(`Setting brief is incomplete:\n${blockers.join('\n')}`)
  return {
    venueName: cleanText(input.venueName),
    location: cleanText(input.location),
    era: cleanText(input.era),
    playableSpaces: cleanResources(input.playableSpaces),
    routes: cleanRoutes(input.routes),
    usableFeatures: cleanFeatures(input.usableFeatures),
    availableProps: cleanProps(input.availableProps),
    tone: cleanText(input.tone),
    safetyConstraints: cleanResources(input.safetyConstraints),
    accessibilityNeeds: cleanResources(input.accessibilityNeeds),
    contentBoundaries: cleanResources(input.contentBoundaries),
  }
}
