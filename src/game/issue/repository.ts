import type { StorylineDefinition } from '../definition/contract'
import type { ExistingGameState } from '../types'

export type DossierIssueClaim = {
  participantId: string
  participantName: string
  roleId: string
  issuedAt: string
}

export type DossierIssueGame = {
  issueCode: string
  gameId: string
  version: number
  state: ExistingGameState
  storyline: StorylineDefinition
  claims: DossierIssueClaim[]
}

/** Atomic public issue port. Implementations must serialize claims per game. */
export type DossierIssueRepository = {
  findOrCreateIssueCode(ownerId: string, gameId: string): Promise<string | undefined>
  findGame(issueCode: string): Promise<DossierIssueGame | undefined>
  claim(issueCode: string, participantId: string, participantName: string): Promise<DossierIssueGame | undefined>
}
