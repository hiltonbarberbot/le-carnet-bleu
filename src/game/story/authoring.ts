import { createSettingBrief } from '../setting/brief'
import type { SettingBrief, SettingBriefInput } from '../setting/contract'
import type { Story } from '../types'
import type { ActDefinition, ClueDeck, SetupRequirement, StorylineDefinition } from '../definition/contract'
import { createStorylineDefinition } from '../definition/create'
import { productNaming } from '../../product/naming'

export type AuthoredStoryline = StorylineDefinition

function list(items: SettingBrief['playableSpaces']) {
  return items.length ? items.map(item => `- [${item.id}] ${item.label}${item.description ? ` · ${item.description}` : ''}`).join('\n') : '- None supplied; do not assume any.'
}

function propList(setting: SettingBrief) {
  return setting.availableProps.length
    ? setting.availableProps.map(prop => `- [${prop.id}] ${prop.label} · quantity ${prop.quantity}${prop.description ? ` · ${prop.description}` : ''}${prop.safetyNotes.length ? ` · safety: ${prop.safetyNotes.join('; ')}` : ''}`).join('\n')
    : '- None supplied; do not assume any.'
}

export function createStoryAuthoringBrief(input: SettingBriefInput): string {
  const setting = createSettingBrief(input)
  return `# ${productNaming.name} authoring brief

Draft a new, setting-specific six-role live murder mystery from the verified information below. Do not reuse the demo plot unless the setting independently supports it. Do not invent rooms, routes, props, permissions, accessibility, or local history.

## Real setting

- Venue: ${setting.venueName}
- Location: ${setting.location}
- Fictional era: ${setting.era}
- Tone: ${setting.tone}

### Playable spaces
${list(setting.playableSpaces)}

### Verified routes
${list(setting.routes)}

### Usable features
${list(setting.usableFeatures)}

### Available props
${propList(setting)}

### Safety constraints
${list(setting.safetyConstraints)}

### Accessibility needs
${list(setting.accessibilityNeeds)}

### Content boundaries
${list(setting.contentBoundaries)}

## Story contract

1. Invent a compelling fictional gathering that fits the verified venue, location, era, and tone. Create one host role who credibly convenes it, becomes Game Master after the staged murder, and exactly five suspect roles.
2. Begin with a human wound or consequential shared history, then derive culprit, motive, method, and cover-up from it.
3. Give every suspect a respectable invitation pretext grounded in the invented gathering, a different private promise from the host, playable traits, exactly three scored objectives, a dense relationship web, truthful secrets about other suspects, a credible motive, and a reason to conceal evidence. Do not add universal powers, mandatory personal props, or private-ballot mechanics.
4. Make the canonical solution fair: write motive, concrete means, opportunity, and fatal act as four distinct atomic solution steps, crosslink them through caseTheory, and give every ordered solution step at least two independent non-culprit evidence routes.
5. Keep dossier secrets as facts the role knows from the start. The three scored objectives are the only player task system.
6. Define exactly one short authored opening, lasting no more than fifteen minutes. It introduces the cast, stages the incident, and ends with the body discovered. After that, the host becomes Game Master and the room enters continuous free play; do not add later scripted acts.
7. Default to no physical props. The story must remain fully playable from dossiers, public facts, conversation, and the app. At most one ordinary, ready-to-hand prop may appear once in the opening, and only when it materially improves play. Never require a kit, replica, lock, hidden compartment, recording, consumable, costume, special container, object swap, or timed prop choreography. A physical object must not be the only carrier of evidence.
8. Derive any setup requirements from exact resource IDs in the verified setting. Every opening step must carry direct { kind, id } settingRefs, setupRequirementIds, and mirrored propIds for prop links.
9. Use only the verified spaces, routes, features, props, and permissions above.
10. Every opening instruction must name exactly one recipientRoleId and speak only to that one person in second-person imperative prose. Give every step exactly one instruction for the host role. Put each participating suspect's private cue in a separate instruction addressed to that suspect; never append a suspect's direction to host prose. Keep physical instructions no-contact, reversible, host-cued, and achievable by a named host proxy.
11. The staged incident creates the only in-game death before bargaining begins. Do not author any later death or remove a player from play.
12. Do not invent a second player task model for AI roles; their play is governed by the same objectives, relationships, and secrets.
13. Create exactly two clue decks tied to verified setting resource IDs and exactly five purchasable clues total. Each clue names the solution-step IDs it supports, but every solution step must retain two independently sourced non-purchasable evidence routes.
14. After the incident, preserve one uninterrupted one-to-three-hour social loop: ten starting tokens, five-token clues, free bargaining, public accusation hearings at any time, majority conviction, and end-of-game objective scoring.
15. Keep five to eight entries in one ordered openingSteps checklist. Do not add phases or a dependency graph; array order is play order. It is a cold open, not a guided first half of the game.
16. Return a schema-v6 StorylineDefinitionInput containing id, title, setting, story, clueDecks, acts, and setupRequirements. Preserve every stable setting resource ID and pass the result through createStorylineDefinition before constructing a runtime.`
}

export function createAuthoredStoryline(input: {
  id: string
  title: string
  setting: SettingBriefInput
  story: Story
  clueDecks: ClueDeck[]
  acts: ActDefinition[]
  setupRequirements: SetupRequirement[]
}): AuthoredStoryline {
  return createStorylineDefinition({
    ...input,
    setting: createSettingBrief(input.setting),
  })
}
