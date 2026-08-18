import { describe, expect, it } from 'vitest'
import { generateGame } from '../generate'
import { getKnownMemories, getMemoriesBeforeAction } from './knowledge'

describe('dossier knowledge', () => {
  const story = generateGame('knowledge')
  const jacques = story.characters.find(character => character.id === 'jacques')!

  it('keeps future events out of the starting dossier', () => {
    expect(getKnownMemories(jacques).map(memory => memory.id)).toEqual(['jacques-duel'])
  })

  it('unlocks observations only after their event is confirmed', () => {
    expect(getKnownMemories(jacques, ['jacket-switch']).map(memory => memory.id)).toEqual(
      expect.arrayContaining(['jacques-duel', 'jacques-find']),
    )
    expect(getKnownMemories(jacques, ['jacket-switch']).map(memory => memory.id)).not.toContain('jacques-shove')

    expect(getKnownMemories(jacques, ['jacket-switch', 'stage-murder']).map(memory => memory.id)).toEqual(
      expect.arrayContaining(['jacques-find', 'jacques-confronts', 'jacques-shove', 'jacques-flight']),
    )
  })

  it('gives an AI actor prior knowledge without leaking its action outcome', () => {
    const known = getMemoriesBeforeAction(story, jacques, 'jacques-murder').map(memory => memory.id)
    expect(known).toContain('jacques-find')
    expect(known).not.toContain('jacques-shove')
    expect(known).not.toContain('jacques-flight')
  })
})
