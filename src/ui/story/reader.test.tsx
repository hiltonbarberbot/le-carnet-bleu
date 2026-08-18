import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../../game/demo'
import { StoryReader } from './reader'

describe('StoryReader', () => {
  it('reads the playable definition as motives, live action, truth and evidence', () => {
    const html = renderToStaticMarkup(<StoryReader definition={createDemoGame('reader')} onExit={() => undefined} />)

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
