import type { StorylineDefinition } from '../../../definition/contract'
import { tableActionKinds, type TableRehearsalReport, type TableTranscriptEvent, type TableTurnAction, type TableTurnRunner, type TableTurnView } from './contract'

const startingTokens = 10
const cluePrice = 5

const unique = (items: string[]) => [...new Set(items)]
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

function validateAction(definition: StorylineDefinition, roleId: string, view: TableTurnView, action: TableTurnAction) {
  if (!tableActionKinds.includes(action.action)) return 'unknown table action'
  if (typeof action.words !== 'string' || wordCount(action.words) < 1 || wordCount(action.words) > 35) return 'table action words must contain 1-35 words'
  if (!Array.isArray(action.caseFactIds) || action.caseFactIds.some(id => typeof id !== 'string')) return 'caseFactIds must be a string list'
  if (action.action === 'share_fact' && !view.knownFactIds.includes(action.factId)) return `${roleId} tried to share a fact they do not know`
  if (action.action === 'ask' && (!definition.story.characters.some(role => role.id === action.targetRoleId) || action.targetRoleId === roleId)) return `${roleId} asked an invalid target`
  if (action.action === 'buy_clue') {
    const deck = view.availableDecks.find(item => item.id === action.deckId)
    if (!deck || deck.remaining < 1 || view.tokenBalance < view.cluePrice) return `${roleId} tried to buy an unavailable clue`
  }
  if (action.action === 'accuse') {
    if (!definition.story.characters.some(role => role.id === action.accusedRoleId) || action.accusedRoleId === roleId) return `${roleId} made an invalid accusation`
    if (unique(action.caseFactIds).length < 2 || action.caseFactIds.some(id => !view.knownFactIds.includes(id))) return `${roleId} made an accusation without two known facts`
  }
  return undefined
}

export function tableRehearsalBlockers(definition: StorylineDefinition, report: TableRehearsalReport) {
  if (report.verdict === 'invalid') return [report.failure ?? 'The round-table rehearsal produced an invalid action.']
  const blockers: string[] = []
  for (const role of definition.story.characters) {
    if (!report.transcript.some(event => event.roleId === role.id && event.action !== 'pass')) blockers.push(`${role.id} had no usable move during the round-table rehearsal.`)
  }
  if (!report.transcript.some(event => event.action === 'share_fact')) blockers.push('No player voluntarily circulated an authored fact.')
  if (!report.transcript.some(event => event.action === 'accuse')) blockers.push('No player could make an evidence-backed accusation.')
  return blockers
}

export function tableRehearsalPassed(report: TableRehearsalReport) {
  const roleIds = Object.keys(report.knownFactIdsByRole)
  return report.verdict === 'completed'
    && roleIds.length > 0
    && roleIds.every(roleId => report.transcript.some(event => event.roleId === roleId && event.action !== 'pass'))
    && report.transcript.some(event => event.action === 'share_fact')
    && report.transcript.some(event => event.action === 'accuse')
}

export function validateTableRehearsalReport(definition: StorylineDefinition, value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['round-table rehearsal is not an object']
  const report = value as Partial<TableRehearsalReport>
  const errors: string[] = []
  const roleIds = definition.story.characters.map(role => role.id)
  const validFactIds = new Set([
    ...definition.story.publicEvidence.map(item => item.id),
    ...definition.story.characters.flatMap(role => role.secrets.map(item => item.id)),
    ...definition.clueDecks.flatMap(deck => deck.clues.map(item => item.id)),
  ])
  if (report.schemaVersion !== 1) errors.push('round-table rehearsal has an unsupported schema version')
  if (report.definitionFingerprint !== definition.fingerprint) errors.push('round-table rehearsal fingerprint does not match the storyline')
  if (typeof report.model !== 'string' || !report.model.trim()) errors.push('round-table rehearsal has no model identity')
  if (!Number.isInteger(report.rounds) || (report.rounds ?? 0) < 1 || (report.rounds ?? 0) > 6) errors.push('round-table rehearsal has an invalid round count')
  if (!['completed', 'invalid'].includes(String(report.verdict))) errors.push('round-table rehearsal has an invalid verdict')
  if (!Array.isArray(report.transcript)) errors.push('round-table rehearsal has no transcript')
  else {
    const eventIds = new Set<string>()
    for (const [index, event] of report.transcript.entries()) {
      if (!event || typeof event !== 'object'
        || typeof event.id !== 'string' || !event.id.trim()
        || eventIds.has(event.id)
        || !Number.isInteger(event.round) || event.round < 1 || event.round > (report.rounds ?? 0)
        || !roleIds.includes(event.roleId)
        || !tableActionKinds.includes(event.action)
        || typeof event.words !== 'string' || wordCount(event.words) < 1 || wordCount(event.words) > 35) {
        errors.push(`round-table transcript event ${index + 1} is invalid`)
      }
      eventIds.add(event.id)
      if (event.factId && !validFactIds.has(event.factId)) errors.push(`round-table transcript event ${event.id} references an unknown fact`)
      if (event.caseFactIds?.some(id => !validFactIds.has(id))) errors.push(`round-table transcript event ${event.id} cites an unknown fact`)
    }
  }
  for (const [label, record] of [
    ['known facts', report.knownFactIdsByRole],
    ['owned clues', report.ownedClueIdsByRole],
  ] as const) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).sort().join('|') !== [...roleIds].sort().join('|')) errors.push(`round-table ${label} do not cover every role`)
    else for (const [roleId, ids] of Object.entries(record)) if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !validFactIds.has(id))) errors.push(`round-table ${label} for ${roleId} are invalid`)
  }
  if (!report.tokenBalancesByRole || typeof report.tokenBalancesByRole !== 'object' || Array.isArray(report.tokenBalancesByRole) || Object.keys(report.tokenBalancesByRole).sort().join('|') !== [...roleIds].sort().join('|')) errors.push('round-table token balances do not cover every role')
  else for (const [roleId, balance] of Object.entries(report.tokenBalancesByRole)) if (!Number.isInteger(balance) || balance < 0 || balance > startingTokens) errors.push(`round-table token balance for ${roleId} is invalid`)
  if (!Array.isArray(report.sharedFactIds) || report.sharedFactIds.some(id => typeof id !== 'string' || !validFactIds.has(id))) errors.push('round-table shared facts are invalid')
  if (report.verdict === 'invalid' && (typeof report.failure !== 'string' || !report.failure.trim())) errors.push('invalid round-table rehearsal has no failure')
  return [...new Set(errors)]
}

export async function simulateRoundTable(
  definition: StorylineDefinition,
  options: { model: string; runTurn: TableTurnRunner; rounds?: number },
): Promise<TableRehearsalReport> {
  const rounds = options.rounds ?? 3
  const roleIds = definition.story.characters.map(role => role.id)
  const publicFactIds = definition.story.publicEvidence.map(item => item.id)
  const known = Object.fromEntries(definition.story.characters.map(role => [role.id, unique([...publicFactIds, ...role.secrets.map(item => item.id)])]))
  const owned = Object.fromEntries(roleIds.map(roleId => [roleId, [] as string[]]))
  const balances = Object.fromEntries(roleIds.map(roleId => [roleId, startingTokens]))
  const remaining = Object.fromEntries(definition.clueDecks.map(deck => [deck.id, deck.clues.map(clue => clue.id)]))
  const shared = new Set(publicFactIds)
  const transcript: TableTranscriptEvent[] = []

  for (let round = 1; round <= rounds; round += 1) {
    const roundStart = structuredClone(transcript)
    const views = roleIds.map((roleId): TableTurnView => ({
      round,
      finalRound: round === rounds,
      transcript: roundStart,
      knownFactIds: [...known[roleId]],
      ownedClueIds: [...owned[roleId]],
      tokenBalance: balances[roleId],
      cluePrice,
      availableDecks: definition.clueDecks.map(deck => ({ id: deck.id, label: deck.label, remaining: remaining[deck.id].length })),
    }))
    const actions = await Promise.all(views.map((view, roleIndex) => options.runTurn(roleIndex, view)))

    for (const [roleIndex, action] of actions.entries()) {
      const roleId = roleIds[roleIndex]
      const invalid = validateAction(definition, roleId, views[roleIndex], action)
      if (invalid) return { schemaVersion: 1, definitionFingerprint: definition.fingerprint, model: options.model, rounds, transcript, sharedFactIds: [...shared], knownFactIdsByRole: known, ownedClueIdsByRole: owned, tokenBalancesByRole: balances, verdict: 'invalid', failure: invalid }

      const event: TableTranscriptEvent = { id: `round-${round}-${roleIndex + 1}`, round, roleId, action: action.action, words: action.words.trim() }
      if (action.action === 'share_fact') {
        event.factId = action.factId
        shared.add(action.factId)
        for (const recipient of roleIds) known[recipient] = unique([...known[recipient], action.factId])
      } else if (action.action === 'ask') event.targetRoleId = action.targetRoleId
      else if (action.action === 'buy_clue') {
        const clueId = remaining[action.deckId].shift()!
        balances[roleId] -= cluePrice
        owned[roleId].push(clueId)
        known[roleId] = unique([...known[roleId], clueId])
        event.deckId = action.deckId
        event.clueId = clueId
      } else if (action.action === 'accuse') {
        event.accusedRoleId = action.accusedRoleId
        event.caseFactIds = unique(action.caseFactIds)
      }
      transcript.push(event)
    }
  }

  return { schemaVersion: 1, definitionFingerprint: definition.fingerprint, model: options.model, rounds, transcript, sharedFactIds: [...shared], knownFactIdsByRole: known, ownedClueIdsByRole: owned, tokenBalancesByRole: balances, verdict: 'completed' }
}
