import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthoringStudio } from './studio'

describe('AI authoring studio', () => {
  it('begins with the real setting instead of demo story setup', () => {
    const html = renderToStaticMarkup(<AuthoringStudio gateway={{ state: 'available', model: 'test/model' }} onExit={() => undefined} onUse={() => undefined} />)
    expect(html).toContain('CREATE WITH AI')
    expect(html).toContain('Tell us about your evening')
    expect(html).toContain('Venue')
    expect(html).not.toContain('Jacques Vallon')
  })
})
