export class DossierIssueError extends Error {
  constructor(readonly code: 'invalid_issue_code' | 'invalid_participant_id' | 'issuing_closed' | 'dossiers_exhausted', message: string) {
    super(message)
    this.name = 'DossierIssueError'
  }
}

export function normalizeParticipantId(value: string) {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (cleaned.length < 2 || cleaned.length > 64) throw new DossierIssueError('invalid_participant_id', 'Use a name or handle between 2 and 64 characters.')
  return cleaned.toLocaleLowerCase('en-US')
}

export function cleanParticipantName(value: string) {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (cleaned.length < 2 || cleaned.length > 64) throw new DossierIssueError('invalid_participant_id', 'Use a name or handle between 2 and 64 characters.')
  return cleaned
}
