import { describe, expect, it } from 'vitest'
import { generateGame } from './generate'

describe('generateGame', () => {
  it('is deterministic for a seed', () => expect(generateGame('bleu')).toEqual(generateGame('bleu')))
  it('keeps every essential timeline beat represented', () => {
    const game = generateGame('coverage')
    const known = new Set(game.characters.flatMap(c => [...c.memories, ...c.actions]).map(item => item.beat).filter(Boolean))
    expect(game.timeline.filter(beat => !known.has(beat.beat))).toEqual([])
  })
  it('changes distribution order with the seed', () => {
    expect(generateGame('one').characters.map(c => c.id)).not.toEqual(generateGame('two').characters.map(c => c.id))
  })
})
