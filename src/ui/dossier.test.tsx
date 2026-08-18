import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateGame } from '../game/generate'
import { PlayerProfile } from './App'

describe('player dossier projection', () => {
  const story = generateGame('dossier-ui')
  const jacques = story.characters.find(character => character.id === 'jacques')!

  it('does not present future events as starting memories', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={jacques} />)
    expect(html).toContain('Pierre once challenged you')
    expect(html).not.toContain('Your shove in the study caused the fatal fall')
    expect(html).not.toContain('You left the study with Le Carnet Bleu')
  })

  it('shows the observations after the host confirms their event', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={jacques} completedBeatIds={['stage-murder']} />)
    expect(html).toContain('Your shove in the study caused the fatal fall')
    expect(html).toContain('You left the study with Le Carnet Bleu')
  })
})
