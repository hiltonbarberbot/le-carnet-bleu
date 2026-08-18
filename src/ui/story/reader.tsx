import type { GameDefinition } from '../../game/definition/contract'
import type { Action, Story } from '../../game/types'

type StoryReaderProps = {
  definition: GameDefinition
  onExit: () => void
}

type IndexedAction = Action & { owner: string }

type EvidenceThread = {
  text: string
  source: string
  availableAfter?: string
}

function indexActions(story: Story) {
  return new Map<string, IndexedAction>(story.characters.flatMap(character =>
    character.actions.map(action => [action.id, { ...action, owner: character.name }] as const),
  ))
}

function indexEvidence(story: Story) {
  const threads: Array<readonly [string, EvidenceThread]> = [
    ...story.publicEvidence.map(item => [item.id, {
      text: item.text,
      source: 'Public scene evidence',
    }] as const),
    ...story.characters.flatMap(character => character.secrets.map(secret => [secret.id, {
      text: secret.text,
      source: `${character.name} · ${secret.kind}`,
      availableAfter: secret.availableAfter,
    }] as const)),
  ]
  return new Map(threads)
}

function StoryCast({ story }: { story: Story }) {
  return <section className="story-section">
    <div className="story-section-heading">
      <span>02 · DRAMATIS PERSONAE</span>
      <h2>What everyone wants</h2>
      <p>Public identities, three playable goals, and the actions each suspect brings into the plot.</p>
    </div>
    <div className="story-cast">
      {story.characters.map(character => <article key={character.id}>
        <header><span>{character.title}</span><h3>{character.name}</h3></header>
        <p>{character.publicFace}</p>
        <dl className="story-motive">
          <div><dt>WHY THEY CAME</dt><dd>{character.invitationPretext}</dd></div>
          <div><dt>WHAT THEY NEED</dt><dd>{character.objectives.map(objective => objective.title).join(' · ')}</dd></div>
        </dl>
        <div className="story-secret"><b>PRIVATE TRUTH</b><p>{character.privateSecret}</p></div>
        <div className="story-contributions"><b>WHAT THEY MAKE HAPPEN</b>{character.actions.map(action => <p key={action.id}><strong>{action.cue}:</strong> {action.text}</p>)}</div>
      </article>)}
    </div>
  </section>
}

function StoryEvening({ story }: { story: Story }) {
  const total = story.evening.reduce((minutes, stage) => minutes + stage.durationMinutes, 0)
  return <section className="story-section">
    <div className="story-section-heading"><span>01 · THE EVENING</span><h2>{total} minutes, start to finish</h2><p>This is the player-facing shape of the night. The host can move on early whenever the room is ready.</p></div>
    <ol className="story-evening">{story.evening.map((stage, index) => <li key={stage.id}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{stage.title}</h3><p>{stage.description}</p></div><b>{stage.durationMinutes} min</b></li>)}</ol>
  </section>
}

function StoryRun({ definition }: { definition: GameDefinition }) {
  const actions = indexActions(definition.story)
  const plannedPhases = new Set(definition.acts.map(act => act.id))
  const phases = [
    ...definition.acts.map(act => ({ id: act.id, title: act.title, goal: act.operatorGoal })),
    ...definition.story.runPlan
      .filter(beat => !plannedPhases.has(beat.phase))
      .map(beat => beat.phase)
      .filter((phase, index, all) => all.indexOf(phase) === index)
      .map(phase => ({ id: phase, title: phase, goal: '' })),
  ]

  return <section className="story-section">
    <div className="story-section-heading">
      <span>03 · THE NIGHT AS PLAYED</span>
      <h2>Cause before effect</h2>
      <p>The live sequence in dependency order. Every numbered card is a host-confirmed event, not backstory.</p>
    </div>
    <div className="story-acts">
      {phases.map((phase, phaseIndex) => <section key={phase.id}>
        <header><span>ACT {phaseIndex + 1}</span><h3>{phase.title}</h3>{phase.goal && <p>{phase.goal}</p>}</header>
        <div className="story-run">
          {definition.story.runPlan.filter(beat => beat.phase === phase.id).map((beat, beatIndex) => <article key={beat.id}>
            <div className="story-run-number">{String(beatIndex + 1).padStart(2, '0')}</div>
            <div>
              <div className="story-run-title"><h4>{beat.title}</h4><span>{beat.essential ? 'REQUIRED' : 'OPTIONAL'}</span></div>
              <p className="story-trigger">When: {beat.trigger}</p>
              <p>{beat.operator}</p>
              {beat.dependsOn.length > 0 && <small>Follows: {beat.dependsOn.map(id => definition.story.runPlan.find(item => item.id === id)?.title ?? id).join(' · ')}</small>}
              {beat.actionIds.map(id => {
                const action = actions.get(id)
                return action ? <div className="story-action" key={id}><b>{action.owner}</b><p>{action.text}</p><small>Result: {action.consequence}</small></div> : null
              })}
            </div>
          </article>)}
        </div>
      </section>)}
    </div>
  </section>
}

function StoryTruth({ story }: { story: Story }) {
  const evidence = indexEvidence(story)
  return <section className="story-section story-truth">
    <div className="story-section-heading">
      <span>05 · CANONICAL RECONSTRUCTION</span>
      <h2>What actually happened</h2>
      <p>Read top to bottom as the solution. The indented notes are the independent routes by which players can establish each claim.</p>
    </div>
    <div className="story-timeline">
      {story.timeline.map(beat => <article key={beat.beat}>
        <div className="story-beat"><span>{String(beat.beat).padStart(2, '0')}</span><div><h3>{beat.title}</h3><p>{beat.truth}</p></div></div>
        <div className="story-evidence">
          {beat.evidence.map(id => {
            const thread = evidence.get(id)
            return <div key={id}><span>{thread?.source ?? 'Missing evidence'}</span><p>{thread?.text ?? id}</p>{thread?.availableAfter && <small>Enters play after “{story.runPlan.find(item => item.id === thread.availableAfter)?.title ?? thread.availableAfter}”.</small>}</div>
          })}
        </div>
      </article>)}
    </div>
  </section>
}

function StoryClues({ definition }: { definition: GameDefinition }) {
  return <section className="story-section">
    <div className="story-section-heading"><span>04 · PURCHASABLE CLUES</span><h2>The complete clue-desk inventory</h2><p>Players draw these privately and without replacement. They corroborate the case; the canonical solution never depends on an unsold clue alone.</p></div>
    <div className="story-decks">{definition.clueDecks.map(deck => <article key={deck.id}><header><span>DECK</span><h3>{deck.label}</h3><small>{deck.settingValue}</small></header><ol>{deck.clues.map(clue => <li key={clue.id}><span>BEAT {clue.beat}</span><p>{clue.text}</p></li>)}</ol></article>)}</div>
  </section>
}

export function StoryReader({ definition, onExit }: StoryReaderProps) {
  const { story } = definition
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
        <p className="story-deck">{story.premise}</p>
        <div className="story-facts">
          <div><span>VICTIM</span><b>{story.victim}</b></div>
          <div><span>CULPRIT</span><b>{story.culprit}</b></div>
          <div><span>STRUCTURE</span><b>{story.timeline.length} truth beats · {story.runPlan.length} live beats</b></div>
        </div>
        <section className="story-synopsis"><span>THE SOLUTION IN ONE PASS</span><p>{story.solution}</p></section>
      </header>
      <StoryEvening story={story} />
      <StoryCast story={story} />
      <StoryRun definition={definition} />
      <StoryClues definition={definition} />
      <StoryTruth story={story} />
      <button className="story-reader-finish" onClick={onExit}>Finished reading — return to the game →</button>
    </main>
  </>
}
