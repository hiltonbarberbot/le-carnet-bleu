import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generateGame } from '../game/generate'
import { PlayerProfile } from './App'

describe('player dossier projection', () => {
  const story = generateGame('dossier-ui')
  const solange = story.characters.find(character => character.id === 'solange')!

  it('presents the complete fixed dossier without runtime unlocks', () => {
    const html = renderToStaticMarkup(<PlayerProfile story={story} character={solange} />)
    expect(html).toContain('transfers Éditions du Méridien')
    expect(html).toContain('safe prop envelope representing a poisoned-splinter trap')
    expect(html).toContain('Mathilde’s handwriting')
  })

  it('shows public evidence only after the host releases it', () => {
    const evidence = story.publicEvidence[0]
    const openingHtml = renderToStaticMarkup(<PlayerProfile story={story} character={solange} />)
    const investigationHtml = renderToStaticMarkup(<PlayerProfile story={story} character={solange} visiblePublicEvidenceIds={[evidence.id]} />)

    expect(openingHtml).not.toContain(evidence.text)
    expect(investigationHtml).toContain('INVESTIGATION RESOURCES')
    expect(investigationHtml).toContain(evidence.text)
    expect(investigationHtml).not.toContain(solange.privateObjective)
  })
})
