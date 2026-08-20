import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { createGame } from '../session/lifecycle'
import { allocateDossierSeat } from './allocation'
import type { DossierIssueGame } from './repository'

function issueGame(): DossierIssueGame {
  const storyline = createDemoStoryline('central-issue')
  return {
    issueCode: '11111111-1111-4111-8111-111111111111',
    gameId: 'issue-game',
    version: 1,
    state: createGame(storyline, new Date('2026-08-20T12:00:00Z'), 'issue-game'),
    storyline,
    claims: [],
  }
}

describe('central dossier allocation', () => {
  it('uses the authored role order and skips every centrally claimed role', () => {
    const game = issueGame()
    const [first, second] = game.state.phase === 'enrolling' ? game.state.setup.seats : []
    game.claims.push({ participantId: 'alice', participantName: 'Alice', roleId: first.roleId, issuedAt: '2026-08-20T12:00:00Z' })

    expect(allocateDossierSeat(game, 'bob').roleId).toBe(second.roleId)
  })

  it('honours a matching host label before taking the next empty role', () => {
    const game = issueGame()
    if (game.state.phase !== 'enrolling') throw new Error('Expected enrolling game')
    const target = game.state.setup.seats[2]
    target.humanName = 'Camille D.'

    expect(allocateDossierSeat(game, 'camille d.').roleId).toBe(target.roleId)
  })

  it('never reuses a role and closes cleanly when the central register is full', () => {
    const game = issueGame()
    if (game.state.phase !== 'enrolling') throw new Error('Expected enrolling game')
    game.claims = game.state.setup.seats.map((seat, index) => ({ participantId: `player-${index}`, participantName: `Player ${index}`, roleId: seat.roleId, issuedAt: '2026-08-20T12:00:00Z' }))

    expect(() => allocateDossierSeat(game, 'late-player')).toThrow(/already been issued/i)
  })
})
