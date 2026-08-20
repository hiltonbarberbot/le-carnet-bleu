import type { Story, Character, PublicEvidence } from '../types'
import { openingInstructionsForRole } from '../story/instructions'

export type PlayerClueSource = { label: string; clueCount: number }

export type PlayerVisiblePacket = {
  publicContext: {
    title: string
    premise: string
    host: Story['host']
    cast: Array<Pick<Character, 'id' | 'name' | 'title' | 'costume' | 'publicFace'>>
    publicEvidence: PublicEvidence[]
    opening: ReturnType<typeof openingInstructionsForRole>
    clueSources: PlayerClueSource[]
  }
  yourDossier: Pick<Character,
    | 'id' | 'name' | 'title' | 'costume' | 'publicFace'
    | 'invitationPretext' | 'invitationPromise' | 'privateIdentity'
    | 'privateSecret' | 'traits' | 'objectives' | 'relationships' | 'secrets'
  >
}

export type PlayerPacketOptions = {
  visiblePublicEvidenceIds?: readonly string[]
  clueSources?: readonly PlayerClueSource[]
}

/** The complete information surface available to one player. */
export function createPlayerVisiblePacket(
  story: Story,
  roleId: string,
  options: PlayerPacketOptions = {},
): PlayerVisiblePacket {
  const role = story.characters.find(character => character.id === roleId)
  if (!role) throw new Error(`No suspect exists for role ${roleId}.`)
  const visibleEvidenceIds = new Set(options.visiblePublicEvidenceIds ?? [])

  return {
    publicContext: {
      title: story.title,
      premise: story.premise,
      host: story.host,
      cast: story.characters.map(character => ({
        id: character.id,
        name: character.name,
        title: character.title,
        costume: character.costume,
        publicFace: character.publicFace,
      })),
      publicEvidence: story.publicEvidence.filter(evidence => visibleEvidenceIds.has(evidence.id)),
      opening: openingInstructionsForRole(story, role.id),
      clueSources: [...(options.clueSources ?? [])],
    },
    yourDossier: {
      id: role.id,
      name: role.name,
      title: role.title,
      costume: role.costume,
      publicFace: role.publicFace,
      invitationPretext: role.invitationPretext,
      invitationPromise: role.invitationPromise,
      privateIdentity: role.privateIdentity,
      privateSecret: role.privateSecret,
      traits: role.traits,
      objectives: role.objectives,
      relationships: role.relationships,
      secrets: role.secrets,
    },
  }
}
