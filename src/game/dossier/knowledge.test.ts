import { describe, expect, it } from 'vitest'
import { generateGame } from '../generate'
import { getKnownSecrets, getSecretsBeforeAction } from './knowledge'

describe('dossier knowledge', () => {
  const story = generateGame('knowledge')
  const solange = story.characters.find(character => character.id === 'solange')!

  it('keeps future events out of the starting dossier', () => {
    expect(getKnownSecrets(solange).map(secret => secret.id)).toEqual(
      expect.arrayContaining(['solange-transfer', 'solange-warning']),
    )
  })

  it('unlocks observations only after their event is confirmed', () => {
    expect(getKnownSecrets(solange, ['display-packets']).map(secret => secret.id)).not.toContain('solange-envelope')
    expect(getKnownSecrets(solange, ['display-packets', 'stage-collapse']).map(secret => secret.id)).toContain('solange-envelope')
  })

  it('gives an AI actor prior knowledge without leaking its action outcome', () => {
    const known = getSecretsBeforeAction(story, solange, 'solange-place-envelope').map(secret => secret.id)
    expect(known).toContain('solange-transfer')
    expect(known).not.toContain('solange-envelope')
  })
})
