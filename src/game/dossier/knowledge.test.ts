import { describe, expect, it } from 'vitest'
import { generateGame } from '../generate'
import { getKnownSecrets, getSecretsBeforeAction } from './knowledge'

describe('dossier knowledge', () => {
  const story = generateGame('knowledge')
  const jacques = story.characters.find(character => character.id === 'jacques')!

  it('keeps future events out of the starting dossier', () => {
    expect(getKnownSecrets(jacques).map(secret => secret.id)).toEqual(
      expect.arrayContaining(['jacques-duel', 'jacques-telegram']),
    )
  })

  it('unlocks observations only after their event is confirmed', () => {
    expect(getKnownSecrets(jacques, ['jacket-switch']).map(secret => secret.id)).toEqual(
      expect.arrayContaining(['jacques-duel', 'jacques-find']),
    )
    expect(getKnownSecrets(jacques, ['jacket-switch']).map(secret => secret.id)).not.toContain('jacques-shove')

    expect(getKnownSecrets(jacques, ['jacket-switch', 'stage-murder']).map(secret => secret.id)).toEqual(
      expect.arrayContaining(['jacques-find', 'jacques-confronts', 'jacques-shove', 'jacques-flight']),
    )
  })

  it('gives an AI actor prior knowledge without leaking its action outcome', () => {
    const known = getSecretsBeforeAction(story, jacques, 'jacques-murder').map(secret => secret.id)
    expect(known).toContain('jacques-find')
    expect(known).not.toContain('jacques-shove')
    expect(known).not.toContain('jacques-flight')
  })
})
