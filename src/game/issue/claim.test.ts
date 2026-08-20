import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { createGame } from '../session/lifecycle'
import { issueDossier, readIssueLobby } from './claim'
import type { DossierIssueGame, DossierIssueRepository } from './repository'

function fixture() {
  const storyline = createDemoStoryline('named-issue')
  const game: DossierIssueGame = {
    issueCode: '11111111-1111-4111-8111-111111111111',
    gameId: 'named-issue-game',
    version: 1,
    state: createGame(storyline, new Date('2026-08-20T12:00:00Z'), 'named-issue-game'),
    storyline,
    claims: [],
  }
  const repository: DossierIssueRepository = {
    async findOrCreateIssueCode() { return game.issueCode },
    async findGame() { return structuredClone(game) },
    async claim(_code, participantId, participantName) {
      const existing = game.claims.find(claim => claim.participantId === participantId)
      if (!existing) {
        const roleId = storyline.story.characters[game.claims.length].id
        game.claims.push({ participantId, participantName, roleId, issuedAt: '2026-08-20T12:00:00Z' })
      }
      return structuredClone(game)
    },
  }
  return { game, repository, storyline }
}

describe('named dossier issue', () => {
  it('stores a normalized named ID and returns only that role packet', async () => {
    const { game, repository, storyline } = fixture()
    const issued = await issueDossier(repository, { issueCode: game.issueCode, participantId: '  Alice Martin  ' })

    expect(issued.participantId).toBe('alice martin')
    expect(issued.participantName).toBe('Alice Martin')
    expect(issued.packet.yourDossier.id).toBe(storyline.story.characters[0].id)
    expect(issued.packet.yourDossier.privateSecret).not.toBe(storyline.story.characters[1].privateSecret)
  })

  it('is idempotent for one named ID and distinct for another', async () => {
    const { game, repository } = fixture()
    const first = await issueDossier(repository, { issueCode: game.issueCode, participantId: 'Alice' })
    const repeated = await issueDossier(repository, { issueCode: game.issueCode, participantId: 'alice' })
    const second = await issueDossier(repository, { issueCode: game.issueCode, participantId: 'Bob' })

    expect(repeated.packet.yourDossier.id).toBe(first.packet.yourDossier.id)
    expect(second.packet.yourDossier.id).not.toBe(first.packet.yourDossier.id)
    expect(game.claims).toHaveLength(2)
  })

  it('counts centrally unclaimed host-reserved dossiers as available', async () => {
    const { game, repository } = fixture()
    if (game.state.phase !== 'enrolling') throw new Error('Expected enrolling game')
    game.state.setup.seats[0].humanName = 'Reserved for Alice'

    const lobby = await readIssueLobby(repository, game.issueCode)

    expect(lobby.availableDossiers).toBe(game.state.setup.seats.length)
  })
})
