import type { StorylineDefinition } from '../../game/definition/contract'
import { getPropBacklinks } from '../../game/props/links'
import { getSettingBacklinks, getSettingResource } from '../../game/setting/links'
import type { Story } from '../../game/types'
import { liveCharacterName, liveInstructionText, liveRoleName, type LiveAssignments } from '../game/live-name'
import type { GameSessionEntry } from '../library/storage'

type GodViewProps = {
  game: GameSessionEntry
  onExit: () => void
}

type EvidenceThread = {
  text: string
  source: string
}

function storyText(story: Story, assignments: LiveAssignments | undefined, text: string) {
  return assignments ? liveInstructionText(story, assignments, text) : text
}

function storyRoleName(story: Story, roleId: string) {
  if (roleId === story.host.id) return story.host.name
  return story.characters.find(character => character.id === roleId)?.name ?? roleId
}

function SettingLinks({ definition, references, assignments }: { definition: StorylineDefinition; references: StorylineDefinition['story']['openingSteps'][number]['settingRefs']; assignments?: LiveAssignments }) {
  if (!references.length) return null
  return <small>Setting: {references.map((reference, index) => {
    const resource = getSettingResource(definition, reference)
    const anchor = reference.kind === 'availableProps' ? `prop-${reference.id}` : `setting-${reference.kind}-${reference.id}`
    return <span key={`${reference.kind}:${reference.id}`}>{index > 0 && ' · '}<a href={`#${anchor}`}>{storyText(definition.story, assignments, resource?.label ?? reference.id)}</a></span>
  })}</small>
}

function indexEvidence(story: Story, assignments?: LiveAssignments) {
  const threads: Array<readonly [string, EvidenceThread]> = [
    ...story.publicEvidence.map(item => [item.id, {
      text: storyText(story, assignments, item.text),
      source: 'Public scene evidence',
    }] as const),
    ...story.characters.flatMap(character => character.secrets.map(secret => [secret.id, {
      text: storyText(story, assignments, secret.text),
      source: `${assignments ? liveCharacterName(character, assignments) : character.name} · ${secret.kind}`,
    }] as const)),
  ]
  return new Map(threads)
}

function StoryCast({ story, assignments }: { story: Story; assignments?: LiveAssignments }) {
  return <section className="story-section">
    <div className="story-section-heading">
      <span>02 · DRAMATIS PERSONAE</span>
      <h2>What everyone wants</h2>
      <p>Public identities, three playable objectives, relationships, and private truths.</p>
    </div>
    <div className="story-cast">
      {story.characters.map(character => <article key={character.id}>
        <header><span>{character.title}</span><h3>{assignments ? liveCharacterName(character, assignments) : character.name}</h3></header>
        <p>{storyText(story, assignments, character.publicFace)}</p>
        <dl className="story-motive">
          <div><dt>WHY THEY CAME</dt><dd>{storyText(story, assignments, character.invitationPretext)}</dd></div>
          <div><dt>WHAT THEY NEED</dt><dd>{character.objectives.map(objective => storyText(story, assignments, objective.title)).join(' · ')}</dd></div>
        </dl>
        <div className="story-secret"><b>PRIVATE TRUTH</b><p>{storyText(story, assignments, character.privateSecret)}</p></div>
      </article>)}
    </div>
  </section>
}

function StoryEvening({ story, assignments }: { story: Story; assignments?: LiveAssignments }) {
  const total = story.evening.reduce((minutes, stage) => minutes + stage.durationMinutes, 0)
  return <section className="story-section">
    <div className="story-section-heading"><span>01 · THE EVENING</span><h2>{total} minutes, start to finish</h2><p>This is the player-facing shape of the night. The host can move on early whenever the room is ready.</p></div>
    <ol className="story-evening">{story.evening.map((stage, index) => <li key={stage.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{storyText(story, assignments, stage.title)}</h3><p>{storyText(story, assignments, stage.description)}</p></div><b>{stage.durationMinutes} min</b></li>)}</ol>
  </section>
}

function StoryRun({ definition, assignments }: { definition: StorylineDefinition; assignments?: LiveAssignments }) {
  const act = definition.acts[0]

  return <section className="story-section">
    <div className="story-section-heading">
      <span>03 · THE NIGHT AS PLAYED</span>
      <h2>The short opening</h2>
      <p>One ordered checklist takes the room from introductions to the body discovery. There is no dependency graph.</p>
    </div>
    <div className="story-acts">
      <section>
        <header><span>OPENING</span><h3>{storyText(definition.story, assignments, act.title)}</h3><p>{storyText(definition.story, assignments, act.operatorGoal)}</p></header>
        <div className="story-run">
          {definition.story.openingSteps.map((step, stepIndex) => <article id={`run-step-${step.id}`} key={step.id}>
            <div className="story-run-number">{String(stepIndex + 1).padStart(2, '0')}</div>
            <div>
              <div className="story-run-title"><h4>{storyText(definition.story, assignments, step.title)}</h4></div>
              <p className="story-trigger">When: {storyText(definition.story, assignments, step.trigger)}</p>
              <p>{storyText(definition.story, assignments, step.instruction)}</p>
              <SettingLinks definition={definition} references={step.settingRefs} assignments={assignments} />
            </div>
          </article>)}
        </div>
      </section>
    </div>
  </section>
}

function StorySetting({ definition, assignments }: { definition: StorylineDefinition; assignments?: LiveAssignments }) {
  const backlinks = getSettingBacklinks(definition).filter(entry => entry.reference.kind !== 'availableProps' && (entry.setupRequirements.length || entry.clueDecks.length || entry.openingSteps.length))
  return <section className="story-section">
    <div className="story-section-heading"><span>05 · VERIFIED SETTING</span><h2>The setting crosslink ledger</h2><p>Every used room, route, feature, constraint, and accessibility need links back to the authored elements that depend on it.</p></div>
    <div className="story-decks">{backlinks.map(({ reference, resource, setupRequirements, clueDecks, openingSteps }) => <article id={`setting-${reference.kind}-${reference.id}`} key={`${reference.kind}:${reference.id}`}>
      <header><span>{reference.kind} · {reference.id}</span><h3>{storyText(definition.story, assignments, resource.label)}</h3></header>
      {'description' in resource && resource.description && <p>{storyText(definition.story, assignments, resource.description)}</p>}
      <dl className="story-motive">
        <div><dt>PREPARE</dt><dd>{setupRequirements.length ? setupRequirements.map(item => storyText(definition.story, assignments, item.label)).join(' · ') : 'No setup check.'}</dd></div>
        <div><dt>CLUE DECKS</dt><dd>{clueDecks.length ? clueDecks.map(item => storyText(definition.story, assignments, item.label)).join(' · ') : 'No clue deck.'}</dd></div>
        <div><dt>HOST STEPS</dt><dd>{openingSteps.length ? openingSteps.map((step, index) => <span key={step.id}>{index > 0 && ' · '}<a href={`#run-step-${step.id}`}>{storyText(definition.story, assignments, step.title)}</a></span>) : 'No opening step.'}</dd></div>
      </dl>
    </article>)}</div>
  </section>
}

function StoryProps({ definition, assignments }: { definition: StorylineDefinition; assignments?: LiveAssignments }) {
  const backlinks = getPropBacklinks(definition)
  return <section className="story-section">
    <div className="story-section-heading"><span>04 · PHYSICAL PROPS</span><h2>The object ledger</h2><p>Every object has one stable setting ID. Links below lead to each authored preparation and host step that uses it.</p></div>
    <div className="story-decks">{backlinks.map(({ prop, setupRequirements, openingSteps }) => <article id={`prop-${prop.id}`} key={prop.id}>
      <header><span>PROP · {prop.id}</span><h3>{storyText(definition.story, assignments, prop.label)}</h3><small>Quantity {prop.quantity}</small></header>
      {prop.description && <p>{storyText(definition.story, assignments, prop.description)}</p>}
      {prop.safetyNotes.length > 0 && <p><b>Safety:</b> {prop.safetyNotes.map(note => storyText(definition.story, assignments, note)).join(' · ')}</p>}
      <dl className="story-motive">
        <div><dt>PREPARE</dt><dd>{setupRequirements.length ? setupRequirements.map(requirement => storyText(definition.story, assignments, requirement.label)).join(' · ') : 'Available in the setting; no authored preparation.'}</dd></div>
        <div><dt>HOST STEPS</dt><dd>{openingSteps.length ? openingSteps.map((step, index) => <span key={step.id}>{index > 0 && ' · '}<a href={`#run-step-${step.id}`}>{storyText(definition.story, assignments, step.title)}</a></span>) : 'No authored opening step.'}</dd></div>
      </dl>
    </article>)}</div>
  </section>
}

function StoryTruth({ story, assignments }: { story: Story; assignments?: LiveAssignments }) {
  const evidence = indexEvidence(story, assignments)
  return <section className="story-section story-truth">
    <div className="story-section-heading">
      <span>07 · CANONICAL TRUTH</span>
      <h2>What actually happened</h2>
      <p>Read top to bottom as the solution. The indented notes are the independent routes by which players can establish each claim.</p>
    </div>
    <div className="story-timeline">
      {story.solutionSteps.map((step, index) => <article key={`${index}-${step.title}`}>
        <div className="story-step"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{storyText(story, assignments, step.title)}</h3><p>{storyText(story, assignments, step.truth)}</p></div></div>
        <div className="story-evidence">
          {step.evidence.map(id => {
            const thread = evidence.get(id)
            return <div key={id}><span>{thread?.source ?? 'Missing evidence'}</span><p>{thread?.text ?? id}</p></div>
          })}
        </div>
      </article>)}
    </div>
  </section>
}

function StoryClues({ definition, assignments }: { definition: StorylineDefinition; assignments?: LiveAssignments }) {
  return <section className="story-section">
    <div className="story-section-heading"><span>06 · PURCHASABLE CLUES</span><h2>The complete clue-desk inventory</h2><p>Players draw these privately and without replacement. They corroborate the case; the canonical solution never depends on an unsold clue alone.</p></div>
    <div className="story-decks">{definition.clueDecks.map(deck => <article key={deck.id}><header><span>DECK</span><h3>{storyText(definition.story, assignments, deck.label)}</h3><small>{deck.source.kind} · {deck.source.id}</small></header><ol>{deck.clues.map((clue, index) => <li key={clue.id}><span>CLUE {index + 1}</span><p>{storyText(definition.story, assignments, clue.text)}</p></li>)}</ol></article>)}</div>
  </section>
}

export function GodView({ game, onExit }: GodViewProps) {
  const definition = game.storyline
  const { story } = definition
  const assignments = game.state.phase === 'active' || game.state.phase === 'completed' ? game.state : undefined
  return <>
    <header className="story-reader-bar">
      <button onClick={onExit}>← Back</button>
      <span>EDITORIAL VIEW · COMPLETE SPOILERS</span>
      <button onClick={() => window.print()}>Print / save PDF</button>
    </header>
    <main className="story-reader">
      <header className="story-reader-hero">
        <span className="kicker">THE WHOLE STORY · {definition.setting.venueName}</span>
        <h1>{story.title}</h1>
        <p className="story-deck">{storyText(story, assignments, story.premise)}</p>
        <div className="story-facts">
          <div><span>VICTIM</span><b>{assignments ? liveRoleName(story, assignments, story.victimRoleId) : storyRoleName(story, story.victimRoleId)}</b></div>
          <div><span>CULPRIT</span><b>{assignments ? liveRoleName(story, assignments, story.culpritRoleId) : storyRoleName(story, story.culpritRoleId)}</b></div>
          <div><span>STRUCTURE</span><b>{story.solutionSteps.length} solution steps · {story.openingSteps.length} opening steps</b></div>
        </div>
        <section className="story-synopsis"><span>THE SOLUTION IN ONE PASS</span><p>{storyText(story, assignments, story.solutionSummary)}</p></section>
      </header>
      <StoryEvening story={story} assignments={assignments} />
      <StoryCast story={story} assignments={assignments} />
      <StoryRun definition={definition} assignments={assignments} />
      <StoryProps definition={definition} assignments={assignments} />
      <StorySetting definition={definition} assignments={assignments} />
      <StoryClues definition={definition} assignments={assignments} />
      <StoryTruth story={story} assignments={assignments} />
      <button className="story-reader-finish" onClick={onExit}>Finished reading — return to the game →</button>
    </main>
  </>
}
