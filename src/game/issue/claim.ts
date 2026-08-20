import { createPlayerVisiblePacket, type PlayerVisiblePacket } from '../player/packet'
import { cleanParticipantName, DossierIssueError, normalizeParticipantId } from './identity'
import type { DossierIssueGame, DossierIssueRepository } from './repository'

export type IssueLobby = {
  issueCode: string
  title: string
  premise: string
  venue: string
  era: string
  totalDossiers: number
  availableDossiers: number
  phase: DossierIssueGame['state']['phase']
}

export type IssuedDossier = {
  issueCode: string
  participantId: string
  participantName: string
  roleIndex: number
  packet: PlayerVisiblePacket
}

function toLobby(game: DossierIssueGame): IssueLobby {
  const claimedRoles = new Set(game.claims.map(claim => claim.roleId))
  return {
    issueCode: game.issueCode,
    title: game.storyline.story.title,
    premise: game.storyline.story.premise,
    venue: game.storyline.setting.venueName,
    era: game.storyline.setting.era,
    totalDossiers: game.storyline.story.characters.length,
    availableDossiers: game.state.phase === 'enrolling'
      ? game.state.setup.seats.filter(seat => !claimedRoles.has(seat.roleId) && !seat.allowAiFallback).length
      : 0,
    phase: game.state.phase,
  }
}

export async function readIssueLobby(repository: DossierIssueRepository, issueCode: string) {
  const game = await repository.findGame(issueCode)
  if (!game) throw new DossierIssueError('invalid_issue_code', 'No game uses that issue code.')
  return toLobby(game)
}

export async function issueDossier(repository: DossierIssueRepository, input: { issueCode: string; participantId: string }) {
  const participantName = cleanParticipantName(input.participantId)
  const participantId = normalizeParticipantId(input.participantId)
  const game = await repository.claim(input.issueCode, participantId, participantName)
  if (!game) throw new DossierIssueError('invalid_issue_code', 'No game uses that issue code.')
  const claim = game.claims.find(item => item.participantId === participantId)
  if (!claim) throw new Error('The central issue register did not return the saved claim.')
  const roleIndex = game.storyline.story.characters.findIndex(character => character.id === claim.roleId)
  if (roleIndex < 0) throw new Error('The centrally issued role no longer exists in this storyline.')
  return {
    issueCode: game.issueCode,
    participantId,
    participantName: claim.participantName,
    roleIndex,
    packet: createPlayerVisiblePacket(game.storyline.story, claim.roleId),
  } satisfies IssuedDossier
}
