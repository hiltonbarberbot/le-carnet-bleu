import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthoringStudio } from './studio'

describe('AI authoring studio', () => {
  it('seeds the complete game from one forgiving prompt', () => {
    const html = renderToStaticMarkup(<AuthoringStudio gateway={{ state: 'available', model: 'test/model' }} onExit={() => undefined} onSave={() => undefined} />)
    expect(html).toContain('CREATE WITH AI')
    expect(html).toContain('Seed the whole game')
    expect(html).toContain('One sentence is enough')
    expect(html).toContain('Make my mystery')
    expect(html).not.toContain('Reality check')
    expect(html).not.toContain('Playable spaces')
    expect(html).not.toContain('Comfort &amp; boundaries')
  })
})
