import type { ActiveGameState, Character, Story } from '../../game/types'

export type LiveAssignments = Pick<ActiveGameState, 'hostName' | 'roster'>
export type LiveStoryNames = Pick<Story, 'host'> & { characters: Array<Pick<Character, 'id' | 'name'>> }

export function liveCharacterName(character: Pick<Character, 'id' | 'name'>, state: LiveAssignments) {
  const assignee = state.roster[character.id]?.displayName ?? 'Unassigned'
  return `${character.name} (${assignee})`
}

export function liveRoleName(story: LiveStoryNames, state: LiveAssignments, roleId: string) {
  if (roleId === story.host.id) return `${story.host.name} (${state.hostName})`
  const character = story.characters.find(item => item.id === roleId)
  return character ? liveCharacterName(character, state) : `${roleId} (Unassigned)`
}

export function liveStoryName(story: LiveStoryNames, state: LiveAssignments, name: string) {
  const character = story.characters.find(item => item.name === name)
  if (character) return liveCharacterName(character, state)
  if (name === story.host.name) return `${name} (${state.hostName})`
  return name
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function liveInstructionText(story: LiveStoryNames, state: LiveAssignments, text: string) {
  const participants = [
    { name: story.host.name, label: liveStoryName(story, state, story.host.name) },
    ...story.characters.map(character => ({ name: character.name, label: liveCharacterName(character, state) })),
  ]
  const candidates = participants.flatMap(participant => {
    const firstName = participant.name.trim().split(/\s+/)[0]
    return [...new Set([participant.name, firstName])].map(alias => ({ alias, label: participant.label }))
  })
  const aliasCounts = new Map<string, number>()
  for (const { alias } of candidates) aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1)
  const replacements = new Map(candidates
    .filter(({ alias }) => aliasCounts.get(alias) === 1)
    .map(({ alias, label }) => [alias, label]))
  const aliases = [...replacements.keys()].sort((left, right) => right.length - left.length)
  if (!aliases.length) return text
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${aliases.map(escapePattern).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu')
  return text.replace(pattern, (_match, prefix: string, alias: string) => `${prefix}${replacements.get(alias)}`)
}
