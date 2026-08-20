import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import characters from './characters.json'
import { LaColombeIssue } from './la-colombe'

describe('designer issue interface', () => {
  it('keeps the exact seven-party public gate and private-file controls', () => {
    const html = renderToStaticMarkup(<LaColombeIssue />)

    expect(characters).toHaveLength(7)
    expect(html).toContain('ISSUE MY DOSSIER')
    expect(html).toContain('The seven guests, identities withheld')
    expect(html).toContain('THE CASE — WHAT EVERY GUEST AT THIS TABLE KNOWS')
    expect(html).toContain("START OVER — CLEAR THIS BROWSER'S PART")
  })

  it('ships every supplied portrait in the same reel order as the cast', () => {
    expect(characters.map(character => character.photo)).toEqual([
      '03-widowed-patroness-bw.jpg',
      '05-retired-agent-bw.jpg',
      '02-disgraced-attache-bw.jpg',
      '01-concierge-bw.jpg',
      '06-cabaret-cryptographer-bw.jpg',
      '04-pastry-magnate-bw.jpg',
      '07-society-photographer-bw.jpg',
    ])
  })
})
