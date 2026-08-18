import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../../game/demo'
import { createGame } from '../../game/session/lifecycle'
import { bindGameToStoryline } from '../library/storage'
import { GodView } from './reader'

describe('GodView', () => {
  it('reads the playable definition as motives, live action, truth and evidence', () => {
    const storyline = createDemoGame('reader')
    const game = bindGameToStoryline(storyline, createGame(storyline, new Date('2026-08-18T10:00:00Z'), 'reader-game'))
    const html = renderToStaticMarkup(<GodView game={game} onExit={() => undefined} />)

    expect(html).toContain('EDITORIAL VIEW · COMPLETE SPOILERS')
    expect(html).toContain('What everyone wants')
    expect(html).toContain('Cause before effect')
    expect(html).toContain('What actually happened')
    expect(html).toContain('Jacques Vallon')
    expect(html).toContain('Stage the murder in the study')
    expect(html).toContain('You watched Jacques borrow Hélène’s silver paper knife')
    expect(html).toContain('Enters play after “Open the Bellande case”')
  })
})
