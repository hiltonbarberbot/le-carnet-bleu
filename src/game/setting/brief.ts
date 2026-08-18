import type { SettingBrief, SettingBriefInput, SettingQuestion } from './contract.js'

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
    why: 'Story beats must be designed around real safety rather than patched afterward.',
    required: true,
  },
  {
    id: 'accessibilityNeeds',
    prompt: 'Does anyone need seated play, step-free routes, larger text, lower sensory load, or another accommodation?',
    why: 'Essential actions must be playable by the people actually attending.',
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

export function getSettingBriefBlockers(input: SettingBriefInput): string[] {
  const blockers: string[] = []
  for (const question of settingQuestions.filter(item => item.required)) {
    const value = input[question.id]
    const missing = Array.isArray(value) ? cleanList(value).length === 0 : !cleanText(value)
    if (missing) blockers.push(question.prompt)
  }
  if (cleanList(input.playableSpaces).length === 1) {
    blockers.push('Name at least two playable areas, or describe how one area can safely change function during the evening.')
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
    playableSpaces: cleanList(input.playableSpaces),
    routes: cleanList(input.routes),
    usableFeatures: cleanList(input.usableFeatures),
    availableProps: cleanList(input.availableProps),
    tone: cleanText(input.tone),
    safetyConstraints: cleanList(input.safetyConstraints),
    accessibilityNeeds: cleanList(input.accessibilityNeeds),
    contentBoundaries: cleanList(input.contentBoundaries),
  }
}
