import { describe, expect, it } from 'vitest'
import { liveCharacterName, liveInstructionText, liveRoleName, liveStoryName, type LiveStoryNames } from './live-name'

describe('live role names', () => {
  it('always formats the fictional name before its assignee', () => {
    const character = { id: 'poppy', name: 'Poppy Ashcombe' }
    const story: LiveStoryNames = {
      host: { id: 'host', name: 'Sacha de Vernay', title: 'Collector and patriarch' },
      characters: [character],
    }
    const state = {
      hostName: 'Jules',
      roster: { poppy: { kind: 'human' as const, displayName: 'Alex' } },
    }

    expect(liveCharacterName(character, state)).toBe('Poppy Ashcombe (Alex)')
    expect(liveRoleName(story, state, character.id)).toBe('Poppy Ashcombe (Alex)')
    expect(liveStoryName(story, state, story.host.name)).toBe('Sacha de Vernay (Jules)')

    const victimFirstName = story.host.name.split(/\s+/)[0]
    const characterFirstName = character.name.split(/\s+/)[0]
    expect(liveInstructionText(story, state, `${victimFirstName} cues ${characterFirstName}.`))
      .toBe('Sacha de Vernay (Jules) cues Poppy Ashcombe (Alex).')

    const reassigned = {
      ...state,
      hostName: 'Morgan',
      roster: { ...state.roster, [character.id]: { kind: 'human' as const, displayName: 'Sam' } },
    }
    expect(liveInstructionText(story, reassigned, `${victimFirstName} cues ${characterFirstName}.`))
      .toBe('Sacha de Vernay (Morgan) cues Poppy Ashcombe (Sam).')
  })
})
