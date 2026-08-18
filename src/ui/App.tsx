import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { generateAiPerformance, readAiGatewayStatus } from '../game/ai/gateway'
import { createDemoGame } from '../game/demo'
import { createStorylineDefinition } from '../game/definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../game/definition/contract'
import { getKnownSecrets } from '../game/dossier/knowledge'
import {
  abortGame,
  advanceAct,
  advanceHearing,
  beginDelivery,
  buyClue,
  calculateScores,
  callAccusation,
  castVote,
  completeGame,
  confirmRunBeat,
  createGame,
  enableDuplicateClues,
  endInvestigation,
  getConvictionThreshold,
  getSetupBlockers,
  getStartBlockers,
  lowerCluePrice,
  prepareGame,
  recordAward,
  recordAiPerformance,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  setObjectiveCompleted,
  startGame,
  togglePause,
  transferTokens,
  undoRunBeat,
  updateEnrolment,
} from '../game/session/lifecycle'
import type { ActiveGameState, Character, GameState, PreparedGameState, RuntimeCapabilities, SetupDraft, Story } from '../game/types'
import { AuthoringStudio } from './authoring/studio'
import { bindGameToStoryline, clearGameLibrary, readGameLibrary, writeGameLibrary, type GameSessionEntry } from './library/storage'
import { GodView } from './story/reader'
import { productNaming } from '../product/naming'

type Mode = 'choose' | 'author' | 'rules' | 'god' | 'host'
type GatewayConnection = { state: 'checking' | 'available' | 'unavailable'; model?: string }
type AiPerformance = { text?: string; pending?: boolean; error?: string }

export function getHostScreen(state: GameState) {
  if (state.phase === 'active') return `active:${state.playPhase}` as const
  return state.phase
}

export function ActiveGameBar({ game, onGodView, onExit }: {
  game: GameSessionEntry
  onGodView: () => void
  onExit: () => void
}) {
  return <header className="mode-bar host-mode"><div><span>HOST DASHBOARD · PRIVATE</span><b>{game.storyline.title} · {game.storyline.story.totalPeople} people · {getHostScreen(game.state)}</b></div><div className="mode-actions"><button onClick={onGodView}>God view · spoilers</button><button className="quiet" onClick={onExit}>Back to storylines</button></div></header>
}

export function StartScreen({ storylines, games, importError, libraryWarning = '', onCreateStoryline, onCreateGame, onContinueGame, onRules, onImport, onExport }: {
  storylines: StorylineDefinition[]
  games: GameSessionEntry[]
  importError: string
  libraryWarning?: string
  onCreateStoryline: () => void
  onCreateGame: (storyline: StorylineDefinition) => void
  onContinueGame: (game: GameSessionEntry) => void
  onRules: (storyline: StorylineDefinition) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: (storyline: StorylineDefinition) => void
}) {
  return <main className="chooser">
    <header className="library-head">
      <div><span className="kicker">{productNaming.uppercaseName}</span><h1>Your storylines</h1><p className="chooser-summary">Write a storyline once, then create a fresh game from it for every group or occasion.</p></div>
      <button className="create-storyline" onClick={onCreateStoryline}><span>NEW</span><b>Create storyline</b><small>Author a reusable mystery for a verified setting.</small><strong aria-hidden="true">＋</strong></button>
    </header>
    {libraryWarning && <section className="library-notice"><span>SAVED GAME NOTICE</span><p>{libraryWarning}</p></section>}
    {importError && <section className="hard-errors compact"><span>IMPORT FAILED</span><pre>{importError}</pre></section>}
    <section className="storyline-library" aria-label="Existing storylines">
      <div className="library-title"><div><span className="kicker">EXISTING STORYLINES</span><h2>Choose a mystery</h2></div><label className="import-storyline"><input type="file" accept="application/json,.json" onChange={onImport} /><span>Import storyline</span></label></div>
      <div className="storyline-grid">{storylines.map(storyline => {
        const storylineGames = games.filter(game => game.storyline.fingerprint === storyline.fingerprint)
        return <article className="storyline-card" key={storyline.fingerprint}>
          <header><span>STORYLINE · {storylineGames.length} {storylineGames.length === 1 ? 'GAME' : 'GAMES'}</span><small>{storyline.setting.venueName}</small></header>
          <h3>{storyline.story.title}</h3>
          <p>{storyline.story.subtitle}</p>
          <div className="storyline-facts"><span>{storyline.setting.era}</span><span>{storyline.setting.tone}</span><span>{storyline.story.characters.length} suspects</span></div>
          <button className="storyline-game-action" onClick={() => onCreateGame(storyline)}>Create game from this storyline <strong aria-hidden="true">→</strong></button>
          {storylineGames.length > 0 && <section className="storyline-games"><b>Games from this storyline</b>{storylineGames.map(game => <button key={game.state.id} onClick={() => onContinueGame(game)}><span><strong>Game {game.state.id.slice(0, 8)}</strong><small>{new Date(game.state.createdAt).toLocaleDateString()} · {getHostScreen(game.state)}</small></span><i>Continue →</i></button>)}</section>}
          <details className="storyline-tools"><summary>Storyline tools</summary><div><button onClick={() => onRules(storyline)}>How to play</button><button onClick={() => onExport(storyline)}>Export</button></div><small>Full story and private dossiers become available to the host after creating a game.</small></details>
        </article>
      })}</div>
    </section>
  </main>
}

export function EveningTimeline({ definition, phase }: { definition: StorylineDefinition; phase?: string }) {
  const elapsed = definition.story.evening.reduce((total, stage) => total + stage.durationMinutes, 0)
  return <section className="evening-timeline">
    <div className="timeline-heading"><div><span className="kicker">THE EVENING</span><h2>One simple path through the night</h2></div><b>About {elapsed} minutes</b></div>
    <ol>{definition.story.evening.map((stage, index) => <li key={stage.id} className={stage.phase === phase ? 'current' : ''}>
      <span>{index + 1}</span><div><b>{stage.title}</b><small>{stage.durationMinutes} min · {stage.description}</small></div>
    </li>)}</ol>
  </section>
}

function Rules({ definition, onExit }: { definition: StorylineDefinition; onExit: () => void }) {
  return <main className="rules-page">
    <button className="rules-back" onClick={onExit}>← Back</button>
    <header><span className="kicker">HOW TO PLAY</span><h1>A murder mystery authored for the place where it happens.</h1><p>Six people play: one host performs the victim and becomes Game Master after the staged incident; five guests each play one suspect.</p></header>
    <section className="rules-summary"><article><b>PEOPLE</b><strong>6 total</strong></article><article><b>TIME</b><strong>1–3 hours</strong></article><article><b>YOU NEED</b><strong>Your private card, the prepared props, and a willingness to ask questions</strong></article></section>
    <EveningTimeline definition={definition} />
    <section className="rules-block"><span>THREE RULES</span><h2>Everything players need to remember</h2><ol><li>Once the body is discovered, pursue your three objectives in any order.</li><li>Bargain, bluff, and withhold—but never invent evidence or pressure the real person.</li><li>Any player may accuse. A strict majority ends the investigation.</li></ol></section>
    <section className="rules-block"><span>THE SOCIAL LOOP</span><h2>Talk → trade → accuse → vote</h2><p>After the short cold open, the room belongs to the players. Each suspect starts with 10 tokens and a private clue costs 5. Trade tokens, clues, and truthful information freely; when someone is ready, they call a public accusation hearing. Set an early time limit and extend it if the room is still alive.</p></section>
    <button className="rules-start" onClick={onExit}>Understood — return →</button>
  </main>
}

export function PlayerProfile({ character, completedBeatIds = [], onExit }: { character: Character; completedBeatIds?: readonly string[]; onExit?: () => void }) {
  const secrets = getKnownSecrets(character, completedBeatIds)
  const fileNumber = String(1200 + [...character.id].reduce((total, letter) => total + letter.charCodeAt(0), 0)).padStart(4, '0')
  const surname = character.name.trim().split(/\s+/).at(-1) ?? character.name
  const initial = character.name.trim().charAt(0)
  return <>
    <div className="mode-bar player-mode"><div><span>PLAYER DOSSIER · ADDRESSEE ONLY</span><b>You are viewing only {character.name}’s classified information</b></div><div className="mode-actions"><button onClick={() => window.print()}>Print / save PDF</button>{onExit && <button className="quiet" onClick={onExit}>Exit dossier</button>}</div></div>
    <article className="profile classified-dossier">
      <span className="dossier-punch dossier-punch-left" aria-hidden="true" />
      <span className="dossier-punch dossier-punch-right" aria-hidden="true" />
      <span className="dossier-fold dossier-fold-a" aria-hidden="true" />
      <span className="dossier-fold dossier-fold-b" aria-hidden="true" />

      <header className="dossier-masthead">
        <div className="dossier-registration">CM-IN-{fileNumber}<br />Filed 2352/14<br />SCM</div>
        <div className="dossier-plate">
          <div className="dossier-classification">SECRET</div>
          <div className="dossier-department">ADDRESSEE ONLY<br />CLASSIFIED MESSAGE CENTER</div>
          <h1 className="dossier-kind">PERSONAL DOSSIER</h1>
        </div>
        <div className="dossier-registration dossier-registration-right">CSWD<br />Nov 14<br />12:34 P</div>
      </header>

      <div className="dossier-wire">
        <p className="dossier-tight">From: BUREAU DES DOSSIERS CLASSÉS, PARIS VI</p>
        <p>To: {character.name.toUpperCase()} -- HAND DELIVERY, DO NOT READ IN COMPANY</p>

        <section className="dossier-section">
          <h2>SECTION I -- DESCRIPTION</h2>
          <p>You are <b>{character.name.toUpperCase()}</b>, {character.title}. {character.publicFace} Your recommended dress is {character.costume}.</p>
          <p className="dossier-hang">You were invited under this respectable pretext: {character.invitationPretext} The host privately promised you: {character.invitationPromise}</p>
          <p className="dossier-hang"><b>DISPOSITION:</b> {character.traits.join('; ')}.</p>
        </section>

        <section className="dossier-section">
          <h2>SECTION II -- SECRETS AND LIES</h2>
          <div className="dossier-section-note">SELF is true of you. FIELD is true of another -- spend it well.</div>
          <ol className="dossier-items">
            <li><span className="dossier-number">01</span><span><b className="dossier-flag">SELF.</b> {character.privateIdentity}</span></li>
            <li><span className="dossier-number">02</span><span><b className="dossier-flag">SELF.</b> {character.privateSecret}</span></li>
            {secrets.map((secret, index) => <li key={secret.id}><span className="dossier-number">{String(index + 3).padStart(2, '0')}</span><span><b className="dossier-flag">{secret.aboutRoleIds?.length ? 'FIELD.' : 'SELF.'}</b> {secret.text}</span></li>)}
          </ol>
        </section>

        <section className="dossier-section">
          <h2>SECTION III -- RELATIONSHIPS</h2>
          <ol className="dossier-items dossier-ledger">
            {character.relationships.map((relationship, index) => <li key={relationship.roleId}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><span><b className="dossier-who">{relationship.roleId.replaceAll('-', ' ').toUpperCase()}</b> -- {relationship.text}</span></li>)}
          </ol>
        </section>

        <section className="dossier-section dossier-objectives">
          <h2>SECTION IV -- OBJECTIVES</h2>
          <div className="dossier-section-note">Your three objectives may be attempted in any order. Mark each completed instruction.</div>
          <ol className="dossier-items">
            {character.objectives.map((objective, index) => <li key={objective.id}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><label><input type="checkbox" /><span><b>{objective.title.toUpperCase()}.</b> {objective.text} <b>{objective.points} {objective.points === 1 ? 'POINT' : 'POINTS'}.</b></span></label></li>)}
          </ol>
        </section>

        {character.actions.map(action => <p className="dossier-cue" key={action.id}><b>YOUR CUE:</b> {action.cue} -- {action.text} <strong>NEVER MENTION THIS INSTRUCTION.</strong></p>)}
      </div>

      <footer className="dossier-band">
        <div className="dossier-declassified"><div>DECLASSIFIED</div><small>E. O. 11652, Sec. 3(E) and 5(D) or (E)<br />Bureau letter, Nov 3, 1972</small><p>By DBS &nbsp; Date <u /> <b>NOV 14 1972</b></p></div>
        <div className="dossier-journal"><small>SÛR. JOURNAL NO</small>J-{fileNumber.slice(-3)}</div>
        <div className="dossier-date-stamp">NOV 14 1947</div>
        <div className="dossier-pencil dossier-pencil-copy">{character.objectives.length + secrets.length}</div>
        <div className="dossier-pencil dossier-pencil-name">{surname}, {initial}.</div>
        <div className="dossier-secret">SECRET</div>
        <div className="dossier-copy-number">COPY No.</div>
        <div className="dossier-forbidden">KEEP THIS PAGE HIDDEN -- DESTROY AFTER PLAY</div>
      </footer>
    </article>
  </>
}

function CanonicalTruth({ story }: { story: Story }) {
  return <section className="canonical-truth"><header><span>THE SOLUTION</span><b>{story.culprit}</b></header><h3>The premise</h3><p>{story.premise}</p><h3>What happened</h3><p>{story.solution}</p><div className="truth-grid">{story.timeline.map(beat => <article key={beat.beat}><span>{beat.beat}</span><div><b>{beat.title}</b><p>{beat.truth}</p></div></article>)}</div></section>
}

function SetupPanel({ definition, setup, capabilities, gateway, onChange, onPrepare, onPreview }: {
  definition: StorylineDefinition
  setup: SetupDraft
  capabilities: RuntimeCapabilities
  gateway: GatewayConnection
  onChange: (setup: SetupDraft) => void
  onPrepare: () => void
  onPreview: (roleId: string) => void
}) {
  const { story } = definition
  const blockers = getSetupBlockers(definition, setup, capabilities)
  function updateSeat(roleId: string, patch: Partial<SetupDraft['seats'][number]>) {
    onChange({ ...setup, seats: setup.seats.map(seat => seat.roleId === roleId ? { ...seat, ...patch } : seat) })
  }
  return <>
    <section className="setup-hero"><span className="kicker">SETUP</span><h1>Assign one person to each role.</h1><p>Enter five names and private handoff addresses, then check the small prop list. The game will guide the rest.</p></section>
    <section className="setup-section"><div className="setup-heading"><span>1</span><div><h2>Name the host</h2><p>The host begins as {story.victim}, performs the short cold open, then becomes Game Master for free play.</p></div></div><label className="field"><span>Host name</span><input value={setup.hostName} onChange={event => onChange({ ...setup, hostName: event.target.value })} placeholder="Host" /></label></section>
    <section className="setup-section"><div className="setup-heading"><span>2</span><div><h2>Enrol the five guest seats</h2><p>Identity and private address must be distinct. Ready means this human accepted the role, not that their dossier was delivered.</p></div></div><div className="seat-grid">{story.characters.map(character => {
      const seat = setup.seats.find(item => item.roleId === character.id)!
      return <article key={character.id} className="seat-card"><header><div><b>{character.name}</b><small>{character.title}</small></div><button onClick={() => onPreview(character.id)}>Preview card</button></header><label className="field"><span>Player name</span><input value={seat.humanName} onChange={event => updateSeat(character.id, { humanName: event.target.value, participantId: event.target.value.trim().toLowerCase().replace(/\s+/g, '-'), ready: false })} placeholder="Name" /></label><label className="field"><span>Private handoff</span><input value={seat.privateAddress} onChange={event => updateSeat(character.id, { privateAddress: event.target.value })} placeholder="Phone, chat, email, or printed envelope" /></label><label className="check-row"><input type="checkbox" checked={seat.ready} onChange={event => updateSeat(character.id, { ready: event.target.checked })} /><span>This person has accepted the role</span></label></article>
    })}</div></section>
    <section className="setup-section"><div className="setup-heading"><span>3</span><div><h2>Prove the setting can perform this story</h2><p>These requirements come from the authored definition for {definition.setting.venueName}.</p></div></div><div className="venue-list">{definition.setupRequirements.map(check => <label key={check.id}><input type="checkbox" checked={Boolean(setup.venue[check.id])} onChange={event => onChange({ ...setup, venue: { ...setup.venue, [check.id]: event.target.checked } })} /><span>{check.label}</span></label>)}</div></section>
    {blockers.length > 0 && <details className="setup-left"><summary>{blockers.length} {blockers.length === 1 ? 'thing' : 'things'} left before roles are ready</summary><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details>}
    <button className="primary-action" disabled={blockers.length > 0} onClick={onPrepare}>Prepare the five private cards →</button>
  </>
}

function Roster({ story, state, onPreview }: { story: Story; state: PreparedGameState | ActiveGameState; onPreview: (roleId: string) => void }) {
  return <section className="roster-strip">{story.characters.map(character => <button key={character.id} onClick={() => onPreview(character.id)}><span>{character.name}</span><b>{state.roster[character.id]?.displayName}</b><small>{state.roster[character.id]?.kind} · dossier →</small></button>)}</section>
}

function DeliveryDesk({ definition, state, onState, run }: { definition: StorylineDefinition; state: PreparedGameState; onState: (state: GameState) => void; run: (command: () => GameState) => void }) {
  const { story } = definition
  const blockers = getStartBlockers(definition, state)
  function markReceived(roleId: string) {
    run(() => {
      let next = state
      const status = next.deliveries[roleId]?.status
      if (status === 'not_requested' || status === 'failed') next = requestDelivery(next, roleId)
      if (next.deliveries[roleId].status === 'queued') next = beginDelivery(next, roleId)
      if (next.deliveries[roleId].status === 'sending') next = recordDeliveryOutcome(next, roleId, { ok: true, receipt: `Confirmed by ${state.hostName}` })
      return next
    })
  }
  return <section className="phase-panel delivery-desk"><span className="kicker">PRIVATE CARDS</span><h2>Make sure each player has only their own role.</h2><p>Send the card privately or place a printed copy in a named envelope. Mark it received when the player has it.</p><div className="delivery-list">{story.characters.map(character => {
    const delivery = state.deliveries[character.id]
    return <article key={character.id} data-status={delivery.status}><div><b>{character.name}</b><small>{state.roster[character.id].displayName} · {delivery.address || 'private card'}</small>{delivery.error && <small className="danger">{delivery.error}</small>}</div><strong>{delivery.status === 'delivered' || delivery.status === 'not_required' ? 'ready' : delivery.status === 'failed' ? 'failed' : 'waiting'}</strong><div className="delivery-actions">{delivery.status !== 'delivered' && delivery.status !== 'not_required' && <button onClick={() => markReceived(character.id)}>Mark received</button>}</div></article>
  })}</div>{blockers.length > 0 && <details className="setup-left"><summary>START BLOCKED · {blockers.length} private {blockers.length === 1 ? 'card' : 'cards'} left</summary><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details>}<button className="primary-action" disabled={blockers.length > 0} onClick={() => onState(startGame(definition, state))}>Everyone is ready — begin the evening →</button></section>
}

function RunSheet({ story, state, performances, onPerform, onConfirm, onUndo }: {
  story: Story
  state: ActiveGameState
  performances: Record<string, AiPerformance>
  onPerform: (roleId: string, actionId: string) => void
  onConfirm: (beatId: string) => void
  onUndo: (beatId: string) => void
}) {
  const beats = story.runPlan.filter(beat => beat.phase === state.playPhase)
  return <div className="run-sheet">{beats.map(beat => {
    const done = state.completedBeatIds.includes(beat.id)
    const blockedBy = beat.dependsOn.filter(id => !state.completedBeatIds.includes(id))
    const actions = beat.actionIds.map(id => story.characters.flatMap(character => character.actions.map(action => ({ ...action, owner: character.name, roleId: character.id }))).find(action => action.id === id)!)
    const missingAiLines = actions.filter(action => state.roster[action.roleId]?.kind === 'ai' && !performances[action.id]?.text)
    return <article key={beat.id} className={`${done ? 'done' : ''} ${beat.essential ? 'essential' : ''}`}><header><div><small>{beat.trigger}</small><h3>{beat.title}</h3></div><b>{beat.essential ? 'REQUIRED' : 'OPTIONAL'}</b></header><p className="operator-copy">{beat.operator}</p>{actions.map(action => {
      const controller = state.roster[action.roleId]
      const proxy = controller?.kind === 'ai' && action.physical ? ` · Physical proxy: ${controller.physicalProxy}` : ''
      const performance = performances[action.id]
      return <div className={`beat-action ${controller?.kind === 'ai' ? 'ai-action' : ''}`} key={action.id}><b>{action.owner}</b><p>{action.text}</p><small>{action.consequence}{proxy}</small>{controller?.kind === 'ai' && <div className="ai-performance">{performance?.text && <blockquote>{performance.text}</blockquote>}{performance?.error && <p>{performance.error}</p>}<button disabled={state.paused || performance?.pending} onClick={() => onPerform(action.roleId, action.id)}>{performance?.pending ? 'Asking Gateway…' : performance?.text ? 'Regenerate AI line' : 'Generate AI line'}</button></div>}</div>
    })}{blockedBy.length > 0 && <p className="blocked-copy">Blocked by: {blockedBy.map(id => story.runPlan.find(item => item.id === id)?.title).join(', ')}</p>}{!done && missingAiLines.length > 0 && <p className="blocked-copy">AI performance required for: {missingAiLines.map(action => action.owner).join(', ')}.</p>}<button disabled={state.paused || blockedBy.length > 0 || (!done && missingAiLines.length > 0)} onClick={() => done ? onUndo(beat.id) : onConfirm(beat.id)}>{done ? 'Undo confirmation' : 'Confirm this beat happened'}</button></article>
  })}</div>
}

function Investigation({ definition, state, run }: { definition: StorylineDefinition; state: ActiveGameState; run: (command: () => ActiveGameState) => void }) {
  const { story } = definition
  const convictionThreshold = getConvictionThreshold(definition)
  const investigationMinutes = story.evening.find(stage => stage.phase === 'investigation')?.durationMinutes ?? 60
  const [fromRoleId, setFromRoleId] = useState(story.characters[0].id)
  const [toRoleId, setToRoleId] = useState(story.characters[1].id)
  const [amount, setAmount] = useState(1)
  const [accuserRoleId, setAccuserRoleId] = useState(story.characters[0].id)
  const [accusedRoleId, setAccusedRoleId] = useState(story.characters[1].id)
  const [caseText, setCaseText] = useState('')
  const characterName = (roleId: string) => story.characters.find(character => character.id === roleId)?.name ?? roleId
  const clues = new Map(definition.clueDecks.flatMap(deck => deck.clues.map(clue => [clue.id, clue] as const)))
  const hearingCopy = state.hearing && {
    case: `${characterName(state.hearing.accuserRoleId)} reads the accusation without interruption.`,
    defense: `${characterName(state.hearing.accusedRoleId)} answers the case.`,
    statements: 'Give each other suspect one brief statement.',
    voting: 'Ask every suspect: convict or acquit?',
  }[state.hearing.stage]

  return <><div className="page-title"><div><span className="kicker">{investigationMinutes} MINUTES RECOMMENDED · OPEN PLAY</span><h2>Talk, trade, accuse.</h2><p>Players run the room now. The host keeps time, sells private clues, and guides a hearing only when someone calls one. Extend play up to three hours if the schemes are still moving.</p></div></div><aside className="host-note"><b>HOST RULE</b><span>The staged incident is the only death. Nobody else dies or leaves play.</span></aside>
    <section className="social-steps"><article><b>1</b><div><h3>Talk freely</h3><p>Question everyone. Bargain with truthful clues, secrets, and tokens.</p></div></article><article><b>2</b><div><h3>Buy private clues</h3><p>Choose either deck. A random clue costs {state.cluePrice} tokens.</p></div></article><article><b>3</b><div><h3>Call an accusation</h3><p>A {convictionThreshold}-of-{story.characters.length} conviction ends the investigation—even if the room is wrong.</p></div></article></section>

    <section className="social-panel"><div className="social-heading"><div><span className="kicker">TOKEN TABLE</span><h3>Record a trade</h3></div><small>Each player began with 10</small></div><div className="trade-form"><select aria-label="Token sender" value={fromRoleId} onChange={event => setFromRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name} · {state.tokenBalances[character.id]}</option>)}</select><span>gives</span><input aria-label="Token amount" type="number" min="1" value={amount} onChange={event => setAmount(Number(event.target.value))} /><span>to</span><select aria-label="Token recipient" value={toRoleId} onChange={event => setToRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name} · {state.tokenBalances[character.id]}</option>)}</select><button disabled={fromRoleId === toRoleId || amount < 1} onClick={() => run(() => transferTokens(state, fromRoleId, toRoleId, amount))}>Record trade</button></div></section>

    <section className="social-panel"><div className="social-heading"><div><span className="kicker">PRIVATE CLUE DESK</span><h3>Sell a clue, then show it only to that player</h3></div><small>{definition.clueDecks.reduce((total, deck) => total + state.clueDecks[deck.id].remainingClueIds.length, 0)} unique clues left</small></div><div className="clue-buyers">{story.characters.map(character => <details key={character.id}><summary><span><b>{character.name}</b><small>{state.tokenBalances[character.id]} tokens · {state.ownedClueIds[character.id].length} clues</small></span><strong>private handoff →</strong></summary><div className="clue-options">{definition.clueDecks.map(deck => <button key={deck.id} disabled={Boolean(state.hearing) || state.tokenBalances[character.id] < state.cluePrice || (!state.clueDecks[deck.id].remainingClueIds.length && !state.duplicateClues)} onClick={() => run(() => buyClue(definition, state, character.id, deck.id))}><b>{deck.label}</b><small>{state.cluePrice} tokens · {state.clueDecks[deck.id].remainingClueIds.length} unique left</small></button>)}</div>{state.ownedClueIds[character.id].map((clueId, index) => <article className="private-clue" key={`${clueId}-${index}`}><span>CLUE {index + 1}</span><p>{clues.get(clueId)?.text}</p></article>)}</details>)}</div><details className="pacing-tools"><summary>Host pacing help</summary><p>If information is moving too slowly, lower the price or allow repeats after a deck empties.</p><div><button disabled={state.cluePrice === 0} onClick={() => run(() => lowerCluePrice(state, state.cluePrice - 1))}>Lower price to {Math.max(0, state.cluePrice - 1)}</button><button disabled={state.duplicateClues} onClick={() => run(() => enableDuplicateClues(state))}>{state.duplicateClues ? 'Repeat clues enabled' : 'Allow repeat clues'}</button></div></details></section>

    <section className="social-panel hearing-panel"><div className="social-heading"><div><span className="kicker">PUBLIC ACCUSATION</span><h3>{state.hearing ? `${characterName(state.hearing.accuserRoleId)} accuses ${characterName(state.hearing.accusedRoleId)}` : 'Call a hearing when someone is ready'}</h3></div>{state.hearing && <strong>{state.hearing.stage.toUpperCase()}</strong>}</div>{state.hearing ? <><aside className="hearing-now"><b>{hearingCopy}</b><p>{state.hearing.caseText}</p></aside>{state.hearing.stage !== 'voting' ? <button className="primary-action" onClick={() => run(() => advanceHearing(state))}>Next: {state.hearing.stage === 'case' ? 'the defense' : state.hearing.stage === 'defense' ? 'open statements' : 'the vote'} →</button> : <div className="vote-list">{story.characters.map(character => { const vote = state.hearing?.votes[character.id]; return <article key={character.id}><b>{character.name}</b>{vote ? <strong>{vote}</strong> : <div><button onClick={() => run(() => castVote(definition, state, character.id, 'convict'))}>Convict</button><button onClick={() => run(() => castVote(definition, state, character.id, 'acquit'))}>Acquit</button></div>}</article> })}</div>}</> : <><div className="accusation-form"><label className="field"><span>Accuser</span><select value={accuserRoleId} onChange={event => setAccuserRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label className="field"><span>Accused</span><select value={accusedRoleId} onChange={event => setAccusedRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label className="field case-field"><span>The case in one sentence</span><input value={caseText} onChange={event => setCaseText(event.target.value)} placeholder="I accuse… because…" /></label></div>{state.hearingHistory.at(-1)?.result === 'failed' && <p className="failed-hearing">The last vote failed. Investigation continues.</p>}<button className="primary-action" disabled={accuserRoleId === accusedRoleId || !caseText.trim()} onClick={() => run(() => callAccusation(state, accuserRoleId, accusedRoleId, caseText))}>Begin the public hearing →</button><button className="time-up" onClick={() => run(() => endInvestigation(state))}>Time is up — reveal without a conviction</button></>}</section>
  </>
}

function AuthoredAct({ definition, state, performances, onPerform, onConfirm, onUndo, onAdvance }: {
  definition: StorylineDefinition
  state: ActiveGameState
  performances: Record<string, AiPerformance>
  onPerform: (roleId: string, actionId: string) => void
  onConfirm: (beatId: string) => void
  onUndo: (beatId: string) => void
  onAdvance: () => void
}) {
  const act = definition.acts.find(item => item.id === state.playPhase)
  if (!act) return null
  const ready = definition.story.runPlan
    .filter(beat => beat.phase === state.playPhase && beat.essential)
    .every(beat => state.completedBeatIds.includes(beat.id))
  return <section className="phase-panel">
    <div className="page-title"><div><span className="kicker">{act.durationMinutes} MINUTES · {state.playPhase}</span><h2>{act.title}</h2><p><b>Tell the players:</b> {act.playerGoal}</p><p className="host-only"><b>Your job:</b> {act.operatorGoal}</p></div></div>
    <RunSheet story={definition.story} state={state} performances={performances} onPerform={onPerform} onConfirm={onConfirm} onUndo={onUndo} />
    <button className="primary-action" disabled={state.paused || !ready} onClick={onAdvance}>{act.completionLabel}</button>
  </section>
}

function TableReveal({ definition, state, run }: { definition: StorylineDefinition; state: ActiveGameState; run: (command: () => ActiveGameState | GameState) => void }) {
  const { story } = definition
  const scores = calculateScores(definition, state)
  const conviction = state.outcome?.kind === 'conviction' ? state.outcome : null
  const accused = conviction ? story.characters.find(character => character.id === conviction.accusedRoleId)?.name : undefined
  return <section className="phase-panel reveal-panel"><span className="kicker">10 MINUTES · TABLE REVEAL</span><h2>{accused ? `The room convicted ${accused}.` : 'Time expired without a conviction.'}</h2><p>Now read the real solution, score private objectives, and choose the two table awards.</p><CanonicalTruth story={story} /><section className="score-room"><div className="social-heading"><div><span className="kicker">FINAL SCORING</span><h3>Tick completed objectives</h3></div><small>Tokens and deduction points are automatic</small></div>{story.characters.map(character => <article key={character.id}><header><div><b>{character.name}</b><small>{state.tokenBalances[character.id]} tokens</small></div><strong>{scores[character.id].total} pts</strong></header><div>{character.objectives.map(objective => <label key={objective.id}><input type="checkbox" checked={state.completedObjectiveIds[character.id].includes(objective.id)} onChange={event => run(() => setObjectiveCompleted(definition, state, character.id, objective.id, event.target.checked))} /><span>{objective.title} · {objective.points}</span></label>)}</div><small>Objectives {scores[character.id].objectivePoints} · tokens {scores[character.id].tokenPoints} · deduction {scores[character.id].accuserPoints + scores[character.id].votePoints} · escape {scores[character.id].culpritEscapePoints}</small></article>)}</section><section className="awards"><h3>Two table-voted awards</h3><div className="award-fields"><label className="field"><span>Best performance</span><select value={state.awards.performanceRoleId ?? ''} onChange={event => event.target.value && run(() => recordAward(definition, state, 'performance', event.target.value))}><option value="">Choose together</option>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label className="field"><span>Best costume</span><select value={state.awards.costumeRoleId ?? ''} onChange={event => event.target.value && run(() => recordAward(definition, state, 'costume', event.target.value))}><option value="">Choose together</option>{story.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label></div></section><button className="primary-action" disabled={state.paused} onClick={() => run(() => completeGame(definition, state))}>Close the case →</button></section>
}

export function HostWorkspace({ definition, state, setState, capabilities, gateway, onPreview }: {
  definition: StorylineDefinition
  state: GameState
  setState: (state: GameState) => void
  capabilities: RuntimeCapabilities
  gateway: GatewayConnection
  onPreview: (roleId: string) => void
}) {
  const { story } = definition
  const [commandError, setCommandError] = useState('')
  const [performanceRequests, setPerformanceRequests] = useState<Record<string, AiPerformance>>({})
  const gameId = state.phase === 'idle' ? '' : state.id
  useEffect(() => setPerformanceRequests({}), [gameId])
  function run<T extends GameState>(command: () => T) { try { setCommandError(''); setState(command()) } catch (error) { setCommandError(error instanceof Error ? error.message : String(error)) } }
  function reset() { if (window.confirm('Reset this game to idle? All enrolment, delivery, and play state will be discarded.')) run(() => resetGame(definition, state, true)) }
  async function perform(roleId: string, actionId: string) {
    if (state.phase !== 'active') return
    setPerformanceRequests(current => ({ ...current, [actionId]: { pending: true } }))
    try {
      const text = await generateAiPerformance({ definition, sessionId: state.id, roleId, actionId })
      setState(recordAiPerformance(definition, state, roleId, actionId, text))
      setPerformanceRequests(current => ({ ...current, [actionId]: {} }))
    } catch (error) {
      setPerformanceRequests(current => ({ ...current, [actionId]: { pending: false, error: error instanceof Error ? error.message : String(error) } }))
    }
  }

  if (state.phase === 'idle') return <main className="page host-page"><section className="setup-hero idle-hero"><span className="kicker">READY FOR {definition.setting.venueName.toUpperCase()}</span><h1>Set up one host and five players.</h1><p>The dashboard will walk you through private cards, the timed evening, accusations, and the reveal.</p><EveningTimeline definition={definition} /><button className="primary-action" onClick={() => setState(createGame(definition))}>Set up this game →</button></section></main>

  const active = state.phase === 'active' ? state : null
  const hostName = state.phase === 'enrolling' ? state.setup.hostName : state.hostName
  return <main className="page host-page">
    <section className="session-head"><div><span className="kicker">GAME {state.id.slice(0, 8)}</span><h1>{active ? `${active.paused ? 'paused · ' : ''}${active.playPhase}` : state.phase}</h1><p>{state.phase === 'enrolling' ? 'Assignments are still editable.' : `${'roster' in state ? Object.keys(state.roster).length : 0} guest seats · ${hostName} host`}</p></div><div className="session-actions">{active && <button onClick={() => setState(togglePause(active))}>{active.paused ? 'Resume' : 'Pause'}</button>}{state.phase !== 'completed' && state.phase !== 'aborted' && <button className="danger-button" onClick={() => run(() => abortGame(state))}>Abort</button>}<button className="danger-button" onClick={reset}>Reset game</button></div></section>
    {commandError && <section className="hard-errors compact"><span>COMMAND FAILED</span><pre>{commandError}</pre></section>}
    {state.phase === 'enrolling' && <SetupPanel definition={definition} setup={state.setup} capabilities={capabilities} gateway={gateway} onChange={setup => setState(updateEnrolment(state, setup))} onPreview={onPreview} onPrepare={() => run(() => prepareGame(definition, state, capabilities))} />}
    {state.phase === 'prepared' && <><Roster story={story} state={state} onPreview={onPreview} /><DeliveryDesk definition={definition} state={state} onState={setState} run={run} /></>}
    {active && <>
      <EveningTimeline definition={definition} phase={active.playPhase} />
      <Roster story={story} state={active} onPreview={onPreview} />
      <AuthoredAct definition={definition} state={active} performances={Object.fromEntries(Object.entries({ ...active.aiPerformances, ...performanceRequests }).map(([id, performance]) => [id, { ...performance, text: active.aiPerformances[id]?.text }]))} onPerform={perform} onConfirm={beatId => run(() => confirmRunBeat(definition, active, beatId))} onUndo={beatId => run(() => undoRunBeat(definition, active, beatId))} onAdvance={() => run(() => advanceAct(definition, active))} />
      {active.playPhase === 'investigation' && <section className="phase-panel"><Investigation definition={definition} state={active} run={run} /></section>}
      {active.playPhase === 'reveal' && <TableReveal definition={definition} state={active} run={run} />}
    </>}
    {state.phase === 'completed' && <section className="phase-panel terminal"><span className="kicker">CASE CLOSED</span><h2>That’s the evening.</h2><div className="final-score-grid">{Object.values(state.finalScores).sort((a, b) => b.total - a.total).map((score, index) => <article key={score.roleId}><span>{index + 1}</span><div><b>{story.characters.find(character => character.id === score.roleId)?.name}</b><small>{score.objectivePoints} objectives · {score.tokenPoints} tokens · {score.accuserPoints + score.votePoints} deduction</small></div><strong>{score.total}</strong></article>)}</div></section>}
    {state.phase === 'aborted' && <section className="phase-panel terminal"><span className="kicker danger">GAME ABORTED</span><h2>No further commands can run.</h2><p>Reset explicitly to return to idle.</p></section>}
  </main>
}

export function App() {
  const demoStoryline = useMemo(() => createDemoGame('browser-demo'), [])
  const initial = useMemo(() => readGameLibrary(localStorage, demoStoryline), [demoStoryline])
  const [storylines, setStorylines] = useState<StorylineDefinition[]>(initial.storylines)
  const [games, setGames] = useState<GameSessionEntry[]>(initial.games)
  const [selectedStorylineFingerprint, setSelectedStorylineFingerprint] = useState(initial.storylines[0].fingerprint)
  const [activeGameId, setActiveGameId] = useState<string>()
  const [mode, setMode] = useState<Mode>('choose')
  const [previewing, setPreviewing] = useState(false)
  const [selected, setSelected] = useState(initial.storylines[0].story.characters[0].id)
  const activeGame = games.find(game => game.state.id === activeGameId)
  const selectedStoryline = storylines.find(storyline => storyline.fingerprint === selectedStorylineFingerprint) ?? storylines[0]
  const [storageError, setStorageError] = useState(initial.error)
  const [importError, setImportError] = useState('')
  const [gateway, setGateway] = useState<GatewayConnection>({ state: 'checking' })
  const capabilities = useMemo<RuntimeCapabilities>(() => ({ aiControllers: gateway.state === 'available' }), [gateway.state])

  useEffect(() => {
    const controller = new AbortController()
    readAiGatewayStatus(controller.signal)
      .then(status => setGateway(status.available ? { state: 'available', model: status.model } : { state: 'unavailable' }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setGateway({ state: 'unavailable' }) })
    return () => controller.abort()
  }, [])
  useEffect(() => { if (!storageError) writeGameLibrary(localStorage, storylines, games) }, [storylines, games, storageError])

  function discardInvalidState() {
    clearGameLibrary(localStorage)
    setStorylines([demoStoryline])
    setGames([])
    setSelectedStorylineFingerprint(demoStoryline.fingerprint)
    setActiveGameId(undefined)
    setStorageError('')
  }
  function preview(roleId: string) {
    if (!activeGame) return
    setSelected(roleId)
    setPreviewing(true)
  }
  function selectStoryline(next: StorylineDefinition) {
    setSelectedStorylineFingerprint(next.fingerprint)
    setSelected(next.story.characters[0].id)
  }
  function showStoryline(next: StorylineDefinition, nextMode: Extract<Mode, 'rules'>) {
    selectStoryline(next)
    setMode(nextMode)
  }
  async function importStoryline(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const next = createStorylineDefinition(JSON.parse(await file.text()) as StorylineDefinitionInput)
      setStorylines(current => current.some(storyline => storyline.fingerprint === next.fingerprint) ? current : [...current, next])
      selectStoryline(next)
      setImportError('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      event.target.value = ''
    }
  }
  function exportStoryline(storyline: StorylineDefinition) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(storyline, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${storyline.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  function saveStoryline(next: StorylineDefinition) {
    setStorylines(current => current.some(storyline => storyline.fingerprint === next.fingerprint) ? current : [...current, next])
    selectStoryline(next)
    setMode('choose')
  }
  function startGameFromStoryline(storyline: StorylineDefinition) {
    const state = createGame(storyline)
    setGames(current => [...current, bindGameToStoryline(storyline, state)])
    selectStoryline(storyline)
    setActiveGameId(state.id)
    setMode('host')
  }
  function continueGame(entry: GameSessionEntry) {
    selectStoryline(entry.storyline)
    setActiveGameId(entry.state.id)
    setMode('host')
  }
  function updateActiveGame(next: GameState) {
    if (!activeGame) return
    if (next.phase === 'idle') {
      setGames(current => current.filter(entry => entry.state.id !== activeGame.state.id))
      setActiveGameId(undefined)
      setMode('choose')
      return
    }
    setGames(current => current.map(entry => entry.state.id === activeGame.state.id
      ? bindGameToStoryline(entry.storyline, next)
      : entry))
  }

  if (storageError) return <main className="fatal-screen"><span className="kicker danger">BOOT FAILED</span><h1>Stored game state is invalid.</h1><pre>{storageError}</pre><button onClick={discardInvalidState}>Discard invalid state</button></main>
  if (mode === 'author') return <AuthoringStudio gateway={gateway} onExit={() => setMode('choose')} onSave={saveStoryline} />
  if (mode === 'rules') return <Rules definition={selectedStoryline} onExit={() => setMode('choose')} />
  if (mode === 'god' && activeGame) return <GodView game={activeGame} onExit={() => setMode('host')} />
  if (previewing && activeGame) {
    const player = activeGame.storyline.story.characters.find(item => item.id === selected) ?? activeGame.storyline.story.characters[0]
    const completedBeatIds = 'completedBeatIds' in activeGame.state ? activeGame.state.completedBeatIds : []
    return <main className="page player-page host-preview"><div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to host dashboard</button><span>HOST PREVIEW · {player.name}</span></div><PlayerProfile character={player} completedBeatIds={completedBeatIds} onExit={() => setPreviewing(false)} /></main>
  }
  if (mode === 'host' && activeGame) {
    const { storyline, state } = activeGame
    return <><ActiveGameBar game={activeGame} onGodView={() => setMode('god')} onExit={() => setMode('choose')} /><HostWorkspace definition={storyline} state={state} setState={updateActiveGame} capabilities={capabilities} gateway={gateway} onPreview={preview} /></>
  }
  return <StartScreen storylines={storylines} games={games} importError={importError} libraryWarning={initial.warning} onCreateStoryline={() => setMode('author')} onCreateGame={startGameFromStoryline} onContinueGame={continueGame} onRules={storyline => showStoryline(storyline, 'rules')} onImport={importStoryline} onExport={exportStoryline} />
}
