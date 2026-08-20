import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../../../demo'
import type { TableTurnAction } from './contract'
import { simulateRoundTable, tableRehearsalBlockers } from './simulate'

const pass = (words = 'I listen for a useful opening.'): TableTurnAction => ({ action: 'pass', factId: '', targetRoleId: '', deckId: '', accusedRoleId: '', caseFactIds: [], words })

describe('round-table rehearsal', () => {
  it('circulates only facts a participant actually knows', async () => {
    const definition = createDemoStoryline('table-sharing')
    const sharedId = definition.story.characters[0].secrets[0].id
    const report = await simulateRoundTable(definition, { model: 'table/model', rounds: 1, runTurn: async roleIndex => roleIndex === 0 ? { ...pass('I disclose the timeline I witnessed.'), action: 'share_fact', factId: sharedId } : pass() })
    expect(report.verdict).toBe('completed')
    for (const facts of Object.values(report.knownFactIdsByRole)) expect(facts).toContain(sharedId)
  })

  it('rejects invented evidence', async () => {
    const definition = createDemoStoryline('table-invention')
    const report = await simulateRoundTable(definition, { model: 'table/model', rounds: 1, runTurn: async roleIndex => roleIndex === 0 ? { ...pass('I disclose an invented confession.'), action: 'share_fact', factId: 'invented-confession' } : pass() })
    expect(report.verdict).toBe('invalid')
    expect(report.failure).toContain('do not know')
  })

  it('blocks a table that only fills in passive self-reports', async () => {
    const definition = createDemoStoryline('table-passive')
    const report = await simulateRoundTable(definition, { model: 'table/model', rounds: 1, runTurn: async () => pass() })
    expect(tableRehearsalBlockers(definition, report)).toContain('No player could make an evidence-backed accusation.')
  })
})
