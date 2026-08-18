import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateGame } from '../game/generate'
import { PlayerProfile } from './App'

describe('player dossier projection', () => {
  const story = generateGame('dossier-ui')
  const solange = story.characters.find(character => character.id === 'solange')!

  it('does not present future events as starting memories', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={solange} />)
    expect(html).toContain('transfers Éditions du Méridien')
    expect(html).not.toContain('safe prop envelope representing a poisoned-splinter trap')
  })

  it('shows the observations after the host confirms their event', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={solange} completedBeatIds={['stage-collapse']} />)
    expect(html).toContain('safe prop envelope representing a poisoned-splinter trap')
    expect(html).toContain('Mathilde’s handwriting')
  })
})
