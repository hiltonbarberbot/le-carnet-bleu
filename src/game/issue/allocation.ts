import type { SeatDraft } from '../types'
import { DossierIssueError, normalizeParticipantId } from './identity'
import type { DossierIssueGame } from './repository'

function sameNamedId(name: string, participantId: string) {
  try { return normalizeParticipantId(name) === participantId } catch { return false }
}

/** Deterministic allocation; the repository serializes this decision per game. */
export function allocateDossierSeat(game: DossierIssueGame, participantId: string): SeatDraft {
  if (game.state.phase !== 'enrolling') throw new DossierIssueError('issuing_closed', 'This game has already locked its dossier assignments.')
  const claimedRoles = new Set(game.claims.map(claim => claim.roleId))
  const named = game.state.setup.seats.find(seat => !claimedRoles.has(seat.roleId) && seat.humanName.trim() && sameNamedId(seat.humanName, participantId))
  const available = game.state.setup.seats.find(seat => !claimedRoles.has(seat.roleId) && !seat.humanName.trim() && !seat.allowAiFallback)
  const seat = named ?? available
  if (!seat) throw new DossierIssueError('dossiers_exhausted', 'Every dossier in this game has already been issued.')
  return seat
}
