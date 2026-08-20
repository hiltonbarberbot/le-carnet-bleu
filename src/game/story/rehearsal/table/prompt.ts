import type { StorylineDefinition } from '../../../definition/contract'
import { createRoleRehearsalPacket } from '../packets'
import type { TableTurnView } from './contract'

function evidenceText(definition: StorylineDefinition) {
  return new Map([
    ...definition.story.publicEvidence.map(item => [item.id, item.text] as const),
    ...definition.story.characters.flatMap(role => role.secrets.map(item => [item.id, item.text] as const)),
    ...definition.clueDecks.flatMap(deck => deck.clues.map(item => [item.id, item.text] as const)),
  ])
}

export function createTableTurnPrompt(definition: StorylineDefinition, roleIndex: number, view: TableTurnView) {
  const role = definition.story.characters[roleIndex]
  if (!role) throw new Error(`No suspect exists for table seat ${roleIndex + 1}.`)
  const evidence = evidenceText(definition)
  const packet = createRoleRehearsalPacket(definition, roleIndex)
  const visibleFacts = view.knownFactIds.map(id => ({ id, text: evidence.get(id) ?? id }))
  const transcript = view.transcript.map(event => ({
    ...event,
    ...(event.factId ? { sharedFactText: evidence.get(event.factId) } : {}),
    ...(event.clueId ? { clueText: event.roleId === role.id ? evidence.get(event.clueId) : '[private to its buyer]' } : {}),
  }))

  return `Play exactly one turn as this suspect in a live social mystery. Use only the real player packet and current table state below. You do not know the solution, culprit marker, other dossiers, or unpurchased clues.

Choose one action:
- share_fact: disclose one factId you currently know;
- ask: ask one targetRoleId a concise question;
- buy_clue: buy from one available deckId when affordable;
- accuse: name one accusedRoleId and cite at least two caseFactIds you currently know;
- pass: only when no useful legal move exists.

Do not invent facts. Sharing is voluntary: protect your objectives and reputation. On the final round, accuse if your evidence supports a coherent case. Return every field; use empty strings or an empty list for irrelevant fields. Keep words under 35 words.

Real player packet:
${JSON.stringify(packet)}

Exact facts currently known:
${JSON.stringify(visibleFacts)}

Table state:
${JSON.stringify({ ...view, transcript })}`
}
