export const tableActionKinds = ['share_fact', 'ask', 'buy_clue', 'accuse', 'pass'] as const
export type TableActionKind = typeof tableActionKinds[number]

export type TableTurnAction = {
  action: TableActionKind
  factId: string
  targetRoleId: string
  deckId: string
  accusedRoleId: string
  caseFactIds: string[]
  words: string
}

export type TableTranscriptEvent = {
  id: string
  round: number
  roleId: string
  action: TableActionKind
  factId?: string
  targetRoleId?: string
  deckId?: string
  clueId?: string
  accusedRoleId?: string
  caseFactIds?: string[]
  words: string
}

export type TableRehearsalReport = {
  schemaVersion: 1
  definitionFingerprint: string
  model: string
  rounds: number
  transcript: TableTranscriptEvent[]
  sharedFactIds: string[]
  knownFactIdsByRole: Record<string, string[]>
  ownedClueIdsByRole: Record<string, string[]>
  tokenBalancesByRole: Record<string, number>
  verdict: 'completed' | 'invalid'
  failure?: string
}

export type TableTurnView = {
  round: number
  finalRound: boolean
  transcript: TableTranscriptEvent[]
  knownFactIds: string[]
  ownedClueIds: string[]
  tokenBalance: number
  cluePrice: number
  availableDecks: Array<{ id: string; label: string; remaining: number }>
}

export type TableTurnRunner = (roleIndex: number, view: TableTurnView) => Promise<TableTurnAction>
