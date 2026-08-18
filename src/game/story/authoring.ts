import { createSettingBrief } from '../setting/brief.js'
import type { SettingBrief, SettingBriefInput } from '../setting/contract.js'
import type { Story } from '../types.js'
import type { ActDefinition, ClueDeck, SetupRequirement, StorylineDefinition } from '../definition/contract.js'
import { createStorylineDefinition } from '../definition/create.js'
import { productNaming } from '../../product/naming.js'

export type AuthoredStoryline = StorylineDefinition

/** @deprecated Use AuthoredStoryline. */
export type AuthoredGame = AuthoredStoryline

function list(items: string[]) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None supplied; do not assume any.'
}

export function createStoryAuthoringBrief(input: SettingBriefInput): string {
  const setting = createSettingBrief(input)
  return `# ${productNaming.name} authoring brief

Draft a new, setting-specific six-person live murder mystery from the verified information below. Do not reuse the demo plot unless the setting independently supports it. Do not invent rooms, routes, props, permissions, accessibility, or local history.

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
${list(setting.availableProps)}

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
4. Make the canonical solution fair: every timeline beat needs at least two independent evidence routes.
5. Separate prior memories from events created live. Gate future observations behind the run-plan beat that creates them.
6. Define exactly one short authored opening, lasting no more than fifteen minutes. It introduces the cast, stages the incident, and ends with the body discovered. After that, the host becomes Game Master and the room enters continuous free play; do not add later scripted acts.
7. Derive setup requirements from exact values in the verified setting. Every physical action must list the requirement IDs it depends on.
8. Use only the verified spaces, routes, features, props, and permissions above.
9. Make every physical action no-contact, reversible, host-cued, and achievable under the stated accessibility needs.
10. The staged incident creates the only in-game death before bargaining begins. Do not author any later death or remove a player from play.
11. Use AI only for bounded dialogue attached to authored actions. A named human proxy owns every physical beat.
12. Create exactly two clue decks tied to verified setting values and exactly five purchasable clues total. These clues may corroborate the solution, but every truth beat must retain two non-purchasable evidence routes.
13. After the incident, preserve one uninterrupted one-to-three-hour social loop: ten starting tokens, five-token clues, free bargaining, public accusation hearings at any time, majority conviction, and end-of-game objective scoring.
14. Keep all five to eight opening run-plan beats inside the one authored opening, with explicit dependencies. They are a cold open, not a guided first half of the game.
15. Return a StorylineDefinitionInput containing id, title, setting, story, clueDecks, acts, and setupRequirements. Pass it through createStorylineDefinition before constructing a runtime.`
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

/** @deprecated Use createAuthoredStoryline. */
export const createAuthoredGame = createAuthoredStoryline
