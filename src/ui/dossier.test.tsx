import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateGame } from '../game/generate'
import { PlayerProfile } from './App'

describe('player dossier projection', () => {
  const story = generateGame('dossier-ui')
  const jacques = story.characters.find(character => character.id === 'jacques')!

  it('does not present future events as starting memories', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={jacques} />)
    expect(html).toContain('Armand’s demands arrived in violet-black ink')
    expect(html).not.toContain('You deliberately killed Armand')
    expect(html).not.toContain('You tore page forty-seven')
  })

  it('shows the observations after the host confirms their event', () => {
    const html = renderToStaticMarkup(<PlayerProfile character={jacques} completedBeatIds={['stage-murder']} />)
    expect(html).toContain('You deliberately killed Armand')
    expect(html).toContain('You tore page forty-seven')
  })
})
