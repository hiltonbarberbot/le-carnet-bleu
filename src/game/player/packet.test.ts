import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { createRoleRehearsalPacket } from '../story/rehearsal/packets'
import { createPlayerVisiblePacket } from './packet'

describe('player-visible packet', () => {
  const definition = createDemoStoryline('player-visible-packet')
  const roleIndex = 0
  const role = definition.story.characters[roleIndex]
  const clueSources = definition.clueDecks.map(deck => ({ label: deck.label, clueCount: deck.clues.length }))

  it('is the single information projection used by post-opening rehearsal', () => {
    const visiblePacket = createPlayerVisiblePacket(definition.story, role.id, {
      visiblePublicEvidenceIds: definition.story.publicEvidence.map(evidence => evidence.id),
      clueSources,
    })
    const rehearsalPacket = createRoleRehearsalPacket(definition, roleIndex)

    expect(rehearsalPacket.publicContext).toEqual(visiblePacket.publicContext)
    expect(rehearsalPacket.yourDossier).toEqual(visiblePacket.yourDossier)
  })

  it('never projects the legacy private objective as player knowledge', () => {
    const packet = createPlayerVisiblePacket(definition.story, role.id)
    const serialized = JSON.stringify(packet)

    expect(role.privateObjective).toBeTruthy()
    expect(serialized).not.toContain(role.privateObjective)
    expect(packet.yourDossier.objectives).toEqual(role.objectives)
    expect('privateObjective' in packet.yourDossier).toBe(false)
  })

  it('reveals only explicitly released public evidence', () => {
    const [evidence] = definition.story.publicEvidence
    const packet = createPlayerVisiblePacket(definition.story, role.id, {
      visiblePublicEvidenceIds: ['not-an-evidence-id', evidence.id],
    })

    expect(packet.publicContext.publicEvidence).toEqual([evidence])
  })
})
