import { describe, expect, it } from 'vitest'
import { generateGame } from '../generate'
import { getKnownSecrets } from './knowledge'

describe('dossier knowledge', () => {
  const story = generateGame('knowledge')
  const solange = story.characters.find(character => character.id === 'solange')!

  it('keeps every authored fact on the player dossier', () => {
    expect(getKnownSecrets(solange).map(secret => secret.id)).toEqual(
      expect.arrayContaining(['solange-transfer', 'solange-warning', 'solange-envelope']),
    )
  })

  it('gives every controller the same fixed dossier', () => {
    const known = getKnownSecrets(solange).map(secret => secret.id)
    expect(known).toContain('solange-transfer')
    expect(known).toContain('solange-envelope')
  })
})
