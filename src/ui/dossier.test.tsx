import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateGame } from '../game/generate'
import { PlayerProfile } from './App'

describe('player dossier projection', () => {
  const story = generateGame('dossier-ui')
  const solange = story.characters.find(character => character.id === 'solange')!

  it('presents the complete fixed dossier without runtime unlocks', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={solange} />)
    expect(html).toContain('transfers Éditions du Méridien')
    expect(html).toContain('safe prop envelope representing a poisoned-splinter trap')
    expect(html).toContain('Mathilde’s handwriting')
  })
})
