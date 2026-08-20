import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../../game/demo'
import { createGame, prepareGame, startGame, updateEnrolment } from '../../game/session/lifecycle'
import { bindGameToStoryline } from '../library/storage'
import { GodView } from './reader'

describe('GodView', () => {
  it('reads the playable definition as motives, live action, truth and evidence', () => {
    const storyline = createDemoStoryline('reader')
    const game = bindGameToStoryline(storyline, createGame(storyline, new Date('2026-08-18T10:00:00Z'), 'reader-game'))
    const html = renderToStaticMarkup(<GodView game={game} onExit={() => undefined} />)

    expect(html).toContain('EDITORIAL VIEW · COMPLETE SPOILERS')
    expect(html).toContain('What everyone wants')
    expect(html).toContain('The short opening')
    expect(html).toContain('What actually happened')
    expect(html).toContain('Solange Béraud')
    expect(html).toContain('Open the sixth envelope')
    expect(html).toContain('Rémy counted five named packets')
    expect(html).toContain('There is no dependency graph')
    expect(html).toContain('The object ledger')
    expect(html).toContain('PROP · notebook')
    expect(html).toContain('href="#prop-notebook"')
    expect(html).toContain('href="#run-step-open-the-account"')
  })

  it('adds assignees to every explicit role label once the game is live', () => {
    const storyline = createDemoStoryline('live-reader')
    let enrolling = createGame(storyline, new Date('2026-08-18T10:00:00Z'), 'live-reader-game')
    enrolling = updateEnrolment(enrolling, {
      hostName: 'Jules',
      seats: enrolling.setup.seats.map((seat, index) => ({ ...seat, humanName: `Player ${index + 1}` })),
      venue: Object.fromEntries(storyline.setupRequirements.map(requirement => [requirement.id, true])),
    })
    const game = bindGameToStoryline(storyline, startGame(storyline, prepareGame(storyline, enrolling, { aiControllers: false })))
    const html = renderToStaticMarkup(<GodView game={game} onExit={() => undefined} />)

    for (const [index, character] of storyline.story.characters.entries()) {
      expect(html).toContain(`${character.name} (Player ${index + 1})`)
    }
    expect(html).toContain(`${storyline.story.host.name} (Jules)`)
    expect(html).not.toContain(storyline.story.premise)
  })
})
