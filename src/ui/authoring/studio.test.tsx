import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthoringStudio, readSettingList } from './studio'

describe('AI authoring studio', () => {
  it('begins with one forgiving prompt instead of a setting form', () => {
    const html = renderToStaticMarkup(<AuthoringStudio gateway={{ state: 'available', model: 'test/model' }} onExit={() => undefined} onSave={() => undefined} />)
    expect(html).toContain('CREATE WITH AI')
    expect(html).toContain('Tell us about your evening')
    expect(html).toContain('What do you have in mind?')
    expect(html).toContain('Spaces, paragraphs, and bullet points all work')
    expect(html).not.toContain('Playable spaces')
    expect(html).not.toContain('Jacques Vallon')
  })

  it('normalizes list delimiters without treating spaces as delimiters', () => {
    expect(readSettingList('Dining room \n\n- Living room with piano\n• Covered balcony; winter garden')).toEqual([
      'Dining room',
      'Living room with piano',
      'Covered balcony',
      'winter garden',
    ])
  })
})
