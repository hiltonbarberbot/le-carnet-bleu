'use client'

import { useEffect, useState, type ChangeEvent } from 'react'
import './aesthetic/theme.css'
import './style.css'
import './aesthetic/classified.css'
import { readAiGatewayStatus } from '../game/ai/gateway'
import type { GameCommand } from '../game/application/commands'
import { createStorylineDefinition } from '../game/definition/create'
import type { StorylineDefinition, StorylineDefinitionInput } from '../game/definition/contract'
import { openingInstructionForRole } from '../game/story/instructions'
import { createPlayerVisiblePacket } from '../game/player/packet'
import { getSettingResource } from '../game/setting/links'
import {
  calculateScores,
  getConvictionThreshold,
  getSetupBlockers,
} from '../game/session/lifecycle'
import type { ActiveGameState, Character, GameState, PreparedGameState, RuntimeCapabilities, SetupDraft, Story } from '../game/types'
import { AuthoringStudio } from './authoring/studio'
import { liveCharacterName, liveInstructionText, liveRoleName } from './game/live-name'
import {
  createRemoteGame,
  importRemoteLibrary,
  LibraryApiError,
  readRemoteGame,
  readRemoteGames,
  readRemoteIssueCode,
  readRemoteStorylines,
  runRemoteGameCommand,
  certifyRemoteStoryline,
} from './library/api'
import { bindGameToStoryline, readGameLibrary, type GameSessionEntry } from './library/storage'
import { GodView } from './story/reader'
import { productNaming } from '../product/naming'

type Mode = 'choose' | 'author' | 'rules' | 'god' | 'host'
type GatewayConnection = { state: 'checking' | 'available' | 'unavailable'; model?: string }
const serverMigrationKey = 'mystery.server-library.v1'
const webRuntimeCapabilities: RuntimeCapabilities = { aiControllers: false }

export function getHostScreen(state: GameState) {
  if (state.phase === 'active') return `active:${state.playPhase}` as const
  return state.phase
}

export function ActiveGameBar({ game, onGodView, onExit }: {
  game: GameSessionEntry
  onGodView: () => void
  onExit: () => void
}) {
  const activeState = game.state.phase === 'active' ? game.state : undefined
  const activeAct = activeState
    ? game.storyline.acts.find(act => act.id === activeState.playPhase)
    : undefined
  const stage = activeAct && activeState ? liveInstructionText(game.storyline.story, activeState, activeAct.title) : (game.state.phase === 'enrolling'
    ? 'Assign roles'
    : game.state.phase === 'prepared'
      ? 'Share dossiers'
      : game.state.phase === 'completed'
        ? 'Case closed'
        : game.state.phase)
  return <header className="mode-bar host-mode"><div><span>HOST VIEW · KEEP PRIVATE</span><b>{game.storyline.title} · {stage}</b></div><div className="mode-actions"><button onClick={onGodView}>Full story · spoilers</button><button className="quiet" onClick={onExit}>Exit game</button></div></header>
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
      {!storylines.length && <section className="library-empty">
        <span className="kicker">NO CERTIFIED STORYLINES YET</span>
        <h3>Generate your first mystery.</h3>
        <p>Only storylines that pass the complete automatic playability gate appear here. Imported files stay quarantined until they are reviewed.</p>
        <button className="storyline-game-action" onClick={onCreateStoryline}>Create and validate a storyline <strong aria-hidden="true">→</strong></button>
      </section>}
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

export function EveningTimeline({ definition, phase, assignments }: { definition: StorylineDefinition; phase?: string; assignments?: ActiveGameState }) {
  const elapsed = definition.story.evening.reduce((total, stage) => total + stage.durationMinutes, 0)
  return <section className="evening-timeline">
    <div className="timeline-heading"><div><span className="kicker">THE EVENING</span><h2>One simple path through the night</h2></div><b>About {elapsed} minutes</b></div>
    <ol>{definition.story.evening.map((stage, index) => <li key={stage.id} className={stage.phase === phase ? 'current' : ''}>
      <span>{index + 1}</span><div><b>{assignments ? liveInstructionText(definition.story, assignments, stage.title) : stage.title}</b><small>{stage.durationMinutes} min · {assignments ? liveInstructionText(definition.story, assignments, stage.description) : stage.description}</small></div>
    </li>)}</ol>
  </section>
}

function Rules({ definition, onExit }: { definition: StorylineDefinition; onExit: () => void }) {
  return <main className="rules-page">
    <button className="rules-back" onClick={onExit}>← Back</button>
    <header><span className="kicker">HOW TO PLAY</span><h1>A murder mystery authored for the place where it happens.</h1><p>At setup, assign names only where useful, then open the private dossier for each role. The app does not infer how many real people are present.</p></header>
    <section className="rules-summary"><article><b>ROLES</b><strong>1 host role + {definition.story.characters.length} suspect roles</strong></article><article><b>TIME</b><strong>1–3 hours</strong></article><article><b>YOU NEED</b><strong>Your private card and a willingness to ask questions</strong></article></section>
    <EveningTimeline definition={definition} />
    <section className="rules-block"><span>THREE RULES</span><h2>Everything players need to remember</h2><ol><li>Once the body is discovered, pursue the objectives in your dossier in any order.</li><li>Bargain, bluff, and withhold—but never invent evidence or pressure the real person.</li><li>Any player may accuse. A strict majority ends the investigation.</li></ol></section>
    <section className="rules-block"><span>THE SOCIAL LOOP</span><h2>Talk → trade → accuse → vote</h2><p>After the short cold open, the room belongs to the players. Each suspect starts with 10 tokens and a private clue costs 5. Trade tokens, clues, and truthful information freely; when someone is ready, they call a public accusation hearing. Set an early time limit and extend it if the room is still alive.</p></section>
    <button className="rules-start" onClick={onExit}>Understood — return →</button>
  </main>
}

export function PlayerProfile({ story, character, visiblePublicEvidenceIds = [], clueSources = [], assignee, formatText = text => text, onExit }: { story: Story; character: Character; visiblePublicEvidenceIds?: readonly string[]; clueSources?: Array<{ label: string; clueCount: number }>; assignee?: string; formatText?: (text: string) => string; onExit?: () => void }) {
  const packet = createPlayerVisiblePacket(story, character.id, { visiblePublicEvidenceIds, clueSources })
  const dossier = packet.yourDossier
  const { publicContext } = packet
  const fileNumber = String(1200 + [...dossier.id].reduce((total, letter) => total + letter.charCodeAt(0), 0)).padStart(4, '0')
  const surname = dossier.name.trim().split(/\s+/).at(-1) ?? dossier.name
  const initial = dossier.name.trim().charAt(0)
  const playerName = assignee ? `${dossier.name} (${assignee})` : dossier.name
  return <>
    <div className="mode-bar player-mode"><div><span>PLAYER DOSSIER · ADDRESSEE ONLY</span><b>You are viewing only {playerName}’s classified information</b></div><div className="mode-actions"><button onClick={() => window.print()}>Print / save PDF</button>{onExit && <button className="quiet" onClick={onExit}>Exit dossier</button>}</div></div>
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
        <p>To: {playerName.toUpperCase()} -- HAND DELIVERY, DO NOT READ IN COMPANY</p>

        <section className="dossier-section">
          <h2>SECTION I -- DESCRIPTION</h2>
          <p>You are <b>{playerName.toUpperCase()}</b>, {formatText(dossier.title)}. {formatText(dossier.publicFace)} Your recommended dress is {formatText(dossier.costume)}.</p>
          <p className="dossier-hang">You were invited under this respectable pretext: {formatText(dossier.invitationPretext)} The host privately promised you: {formatText(dossier.invitationPromise)}</p>
          <p className="dossier-hang"><b>DISPOSITION:</b> {dossier.traits.map(formatText).join('; ')}.</p>
        </section>

        <section className="dossier-section">
          <h2>SECTION II -- PUBLIC BRIEFING</h2>
          <p><b>{formatText(publicContext.title).toUpperCase()}.</b> {formatText(publicContext.premise)}</p>
          <p className="dossier-hang"><b>HOST:</b> {formatText(publicContext.host.name)}, {formatText(publicContext.host.title)}.</p>
          <ol className="dossier-items dossier-ledger">
            {publicContext.cast.map((member, index) => <li key={member.id}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><span><b className="dossier-who">{formatText(member.name).toUpperCase()}</b> -- {formatText(member.title)}. {formatText(member.publicFace)}</span></li>)}
          </ol>
        </section>

        <section className="dossier-section">
          <h2>SECTION III -- SECRETS AND LIES</h2>
          <div className="dossier-section-note">SELF is true of you. FIELD is true of another -- spend it well.</div>
          <ol className="dossier-items">
            <li><span className="dossier-number">01</span><span><b className="dossier-flag">SELF.</b> {formatText(dossier.privateIdentity)}</span></li>
            <li><span className="dossier-number">02</span><span><b className="dossier-flag">SELF.</b> {formatText(dossier.privateSecret)}</span></li>
            {dossier.secrets.map((secret, index) => <li key={secret.id}><span className="dossier-number">{String(index + 3).padStart(2, '0')}</span><span><b className="dossier-flag">{secret.aboutRoleIds?.length ? 'FIELD.' : 'SELF.'}</b> {formatText(secret.text)}</span></li>)}
          </ol>
        </section>

        <section className="dossier-section">
          <h2>SECTION IV -- RELATIONSHIPS</h2>
          <ol className="dossier-items dossier-ledger">
            {dossier.relationships.map((relationship, index) => <li key={relationship.roleId}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><span><b className="dossier-who">{relationship.roleId.replaceAll('-', ' ').toUpperCase()}</b> -- {formatText(relationship.text)}</span></li>)}
          </ol>
        </section>

        <section className="dossier-section dossier-objectives">
          <h2>SECTION V -- OPENING CUES</h2>
          <div className="dossier-section-note">Wait until the host calls on you. These directions are for you alone.</div>
          {publicContext.opening.length ? <ol className="dossier-items">
            {publicContext.opening.map((cue, index) => <li key={cue.stepId}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><span><b>{formatText(cue.stepTitle).toUpperCase()}.</b> {formatText(cue.text)}</span></li>)}
          </ol> : <p>You have no individual action in the scripted opening. Stay in character and follow the host.</p>}
        </section>

        <section className="dossier-section dossier-objectives">
          <h2>SECTION VI -- OBJECTIVES</h2>
          <div className="dossier-section-note">Your {dossier.objectives.length} objectives may be attempted in any order. Mark each completed instruction.</div>
          <ol className="dossier-items">
            {dossier.objectives.map((objective, index) => <li key={objective.id}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><label><input type="checkbox" /><span><b>{formatText(objective.title).toUpperCase()}.</b> {formatText(objective.text)} <b>{objective.points} {objective.points === 1 ? 'POINT' : 'POINTS'}.</b></span></label></li>)}
          </ol>
        </section>

        {(publicContext.publicEvidence.length > 0 || publicContext.clueSources.length > 0) && <section className="dossier-section">
          <h2>SECTION VII -- INVESTIGATION RESOURCES</h2>
          {publicContext.publicEvidence.length > 0 && <><div className="dossier-section-note">The host has released these facts to the whole room. They are safe to discuss openly.</div>
            <ol className="dossier-items">
              {publicContext.publicEvidence.map((evidence, index) => <li key={evidence.id}><span className="dossier-number">{String(index + 1).padStart(2, '0')}</span><span>{formatText(evidence.text)}</span></li>)}
            </ol></>}
          {publicContext.clueSources.length > 0 && <p className="dossier-hang"><b>PRIVATE CLUE DESKS:</b> {publicContext.clueSources.map(source => `${formatText(source.label)} (${source.clueCount})`).join('; ')}.</p>}
        </section>}

      </div>

      <footer className="dossier-band">
        <div className="dossier-declassified"><div>DECLASSIFIED</div><small>E. O. 11652, Sec. 3(E) and 5(D) or (E)<br />Bureau letter, Nov 3, 1972</small><p>By DBS &nbsp; Date <u /> <b>NOV 14 1972</b></p></div>
        <div className="dossier-journal"><small>SÛR. JOURNAL NO</small>J-{fileNumber.slice(-3)}</div>
        <div className="dossier-date-stamp">NOV 14 1947</div>
        <div className="dossier-pencil dossier-pencil-copy">{dossier.objectives.length + dossier.secrets.length}</div>
        <div className="dossier-pencil dossier-pencil-name">{surname}, {initial}.</div>
        <div className="dossier-secret">SECRET</div>
        <div className="dossier-copy-number">COPY No.</div>
        <div className="dossier-forbidden">KEEP THIS PAGE HIDDEN -- DESTROY AFTER PLAY</div>
      </footer>
    </article>
  </>
}

function CanonicalTruth({ story, state }: { story: Story; state: ActiveGameState }) {
  return <section className="canonical-truth"><header><span>THE SOLUTION</span><b>{liveRoleName(story, state, story.culpritRoleId)}</b></header><h3>The premise</h3><p>{liveInstructionText(story, state, story.premise)}</p><h3>What happened</h3><p>{liveInstructionText(story, state, story.solutionSummary)}</p><div className="truth-grid">{story.solutionSteps.map((step, index) => <article key={step.id}><span>{index + 1}</span><div><b>{liveInstructionText(story, state, step.title)}</b><p>{liveInstructionText(story, state, step.truth)}</p></div></article>)}</div></section>
}

function SetupPanel({ definition, setup, issueCode, capabilities, onChange, onPrepare, onPreview, onRefresh }: {
  definition: StorylineDefinition
  setup: SetupDraft
  issueCode?: string
  capabilities: RuntimeCapabilities
  onChange: (setup: SetupDraft) => void
  onPrepare: () => void
  onPreview: (roleId: string) => void
  onRefresh?: () => void
}) {
  const { story } = definition
  const blockers = getSetupBlockers(definition, setup, capabilities)
  function updateSeat(roleId: string, patch: Partial<SetupDraft['seats'][number]>) {
    onChange({ ...setup, seats: setup.seats.map(seat => seat.roleId === roleId ? { ...seat, ...patch } : seat) })
  }
  return <>
    <section className="setup-hero"><span className="kicker">ROLE ASSIGNMENTS</span><h1>Put a named player behind every dossier.</h1><p>Each self-issued player receives one central ID and one role. Every role still needs a person before play begins.</p></section>
    {issueCode && <section className="setup-section issue-link"><div className="setup-heading"><span>↗</span><div><h2>Let players issue their own dossiers</h2><p>Share this link. The central register assigns the next free role in order, never through a local random draw.</p></div></div><a href={`/issue?game=${encodeURIComponent(issueCode)}`} target="_blank" rel="noreferrer">/issue?game={issueCode}</a>{onRefresh && <button type="button" onClick={onRefresh}>Refresh issued names</button>}</section>}
    <section className="setup-section"><div className="setup-heading"><span>1</span><div><h2>Name the host</h2><p>The host begins as {story.host.name}, performs the short cold open, then becomes Game Master for free play.</p></div></div><label className="field"><span>Host name</span><input value={setup.hostName} onChange={event => onChange({ ...setup, hostName: event.target.value })} placeholder="Host" /></label></section>
    <section className="setup-section"><div className="setup-heading"><span>2</span><div><h2>Assign names to roles</h2><p>These are labels for the dossier list—not verified identities or delivery addresses.</p></div></div><div className="seat-grid">{story.characters.map(character => {
      const seat = setup.seats.find(item => item.roleId === character.id)!
      return <article key={character.id} className="seat-card"><header><div><b>{character.name}</b><small>{character.title}</small></div><button type="button" onClick={() => onPreview(character.id)}>Open dossier / PDF</button></header><label className="field"><span>Assigned player</span><input value={seat.humanName} onChange={event => updateSeat(character.id, { humanName: event.target.value })} placeholder="Who will play this role?" /></label></article>
    })}</div></section>
    <section className="setup-section"><div className="setup-heading"><span>3</span><div><h2>Prove the setting can perform this story</h2><p>These requirements come from the authored definition for {definition.setting.venueName}.</p></div></div><div className="venue-list">{definition.setupRequirements.map(check => { const resource = getSettingResource(definition, check.settingRef); return <label key={check.id}><input type="checkbox" checked={Boolean(setup.venue[check.id])} onChange={event => onChange({ ...setup, venue: { ...setup.venue, [check.id]: event.target.checked } })} /><span>{check.label}<small>{check.settingRef.kind} · {check.settingRef.id} · {resource?.label}</small></span></label> })}</div></section>
    {blockers.length > 0 && <details className="setup-left"><summary>{blockers.length} {blockers.length === 1 ? 'thing' : 'things'} left before roles are ready</summary><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details>}
    <button className="primary-action" disabled={blockers.length > 0} onClick={onPrepare}>Save assignments and open dossiers →</button>
  </>
}

function Roster({ story, state, onPreview }: { story: Story; state: PreparedGameState | ActiveGameState; onPreview: (roleId: string) => void }) {
  const isLive = state.phase === 'active'
  return <section className="roster-strip">{story.characters.map(character => <button key={character.id} onClick={() => onPreview(character.id)}>{isLive ? <b>{liveCharacterName(character, state)}</b> : <><span>{character.name}</span><b>{state.roster[character.id]?.displayName}</b></>}<small>{state.roster[character.id]?.kind} · dossier →</small></button>)}</section>
}

function DossierDesk({ definition, state, onStart, onPreview }: { definition: StorylineDefinition; state: PreparedGameState; onStart: () => void; onPreview: (roleId: string) => void }) {
  const { story } = definition
  return <section className="phase-panel dossier-desk"><span className="kicker">DOSSIERS</span><h2>Open each role’s private PDF.</h2><p>The assigned name is only a label. You decide how to share or print each dossier.</p><div className="dossier-links">{story.characters.map(character => {
    const assignment = state.roster[character.id]
    return <article key={character.id}><div><b>{character.name}</b><small>{assignment.displayName}</small></div><div className="dossier-actions"><button type="button" onClick={() => onPreview(character.id)}>Open / save PDF</button></div></article>
  })}</div><button className="primary-action" onClick={onStart}>Begin the evening →</button></section>
}

function RunSheet({ story, state, onConfirm, onUndo }: {
  story: Story
  state: ActiveGameState
  onConfirm: (stepId: string) => void
  onUndo: (stepId: string) => void
}) {
  const steps = story.openingSteps
  const entries = steps.map(step => {
    const done = state.completedStepIds.includes(step.id)
    return { step, done }
  })
  const current = entries.find(entry => !entry.done)
  const completed = entries.filter(entry => entry.done)
  const upcoming = entries.filter(entry => !entry.done && entry.step.id !== current?.step.id)

  return <div className="live-run-sheet">
    {current ? <article className="now-step" aria-current="step">
      <header className="now-step-head"><div><span><i aria-hidden="true">{completed.length + 1}</i>{state.paused ? 'PAUSED' : 'DO THIS NOW'}</span><h3>{liveInstructionText(story, state, current.step.title)}</h3></div></header>
      <p className="now-trigger"><b>Wait for</b><span>{liveInstructionText(story, state, current.step.trigger)}</span></p>
      <section className="host-instruction"><span>YOU, THE HOST</span><p>{liveInstructionText(story, state, openingInstructionForRole(current.step, story.host.id)!.text)}</p></section>
      <button className="step-done" disabled={state.paused} onClick={() => onConfirm(current.step.id)}>Done — show me the next step →</button>
    </article> : <section className="run-complete"><span>ACT COMPLETE</span><h3>You’ve finished every step in this act.</h3></section>}

    {upcoming.length > 0 && <details className="later-steps"><summary><span>Coming up</span><b>{upcoming.length} {upcoming.length === 1 ? 'later step' : 'later steps'} <i aria-hidden="true">＋</i></b></summary><ol>{upcoming.map(({ step }) => <li key={step.id}><span>{liveInstructionText(story, state, step.title)}</span><small>{liveInstructionText(story, state, step.trigger)}</small></li>)}</ol></details>}
    {completed.length > 0 && <details className="completed-steps"><summary><span>Completed</span><b>{completed.length} {completed.length === 1 ? 'step' : 'steps'} <i aria-hidden="true">＋</i></b></summary><ol>{completed.map(({ step }) => <li key={step.id}><span><b>✓</b>{liveInstructionText(story, state, step.title)}</span><button onClick={() => onUndo(step.id)}>Undo</button></li>)}</ol></details>}
  </div>
}

function Investigation({ definition, state, run }: { definition: StorylineDefinition; state: ActiveGameState; run: (command: GameCommand) => void }) {
  const { story } = definition
  const convictionThreshold = getConvictionThreshold(definition)
  const investigationMinutes = story.evening.find(stage => stage.phase === 'investigation')?.durationMinutes ?? 60
  const [fromRoleId, setFromRoleId] = useState(story.characters[0].id)
  const [toRoleId, setToRoleId] = useState(story.characters[1].id)
  const [amount, setAmount] = useState(1)
  const [accuserRoleId, setAccuserRoleId] = useState(story.characters[0].id)
  const [accusedRoleId, setAccusedRoleId] = useState(story.characters[1].id)
  const [caseText, setCaseText] = useState('')
  const characterName = (roleId: string) => liveRoleName(story, state, roleId)
  const clues = new Map(definition.clueDecks.flatMap(deck => deck.clues.map(clue => [clue.id, clue] as const)))
  const hearingCopy = state.hearing && {
    case: `${characterName(state.hearing.accuserRoleId)} reads the accusation without interruption.`,
    defense: `${characterName(state.hearing.accusedRoleId)} answers the case.`,
    statements: 'Give each other suspect one brief statement.',
    voting: 'Ask every suspect: convict or acquit?',
  }[state.hearing.stage]

  return <><div className="page-title"><div><span className="kicker">{investigationMinutes} MINUTES RECOMMENDED · OPEN PLAY</span><h2>Talk, trade, accuse.</h2><p>Players run the room now. The host keeps time, sells private clues, and guides a hearing only when someone calls one. Extend play up to three hours if the schemes are still moving.</p></div></div><aside className="host-note"><b>HOST RULE</b><span>The staged incident is the only death. Nobody else dies or leaves play.</span></aside>
    <section className="social-steps"><article><b>1</b><div><h3>Talk freely</h3><p>Question everyone. Bargain with truthful clues, secrets, and tokens.</p></div></article><article><b>2</b><div><h3>Buy private clues</h3><p>Choose either deck. A random clue costs {state.cluePrice} tokens.</p></div></article><article><b>3</b><div><h3>Call an accusation</h3><p>A {convictionThreshold}-of-{story.characters.length} conviction ends the investigation—even if the room is wrong.</p></div></article></section>

    <section className="social-panel"><div className="social-heading"><div><span className="kicker">TOKEN TABLE</span><h3>Record a trade</h3></div><small>Each player began with 10</small></div><div className="trade-form"><select aria-label="Token sender" value={fromRoleId} onChange={event => setFromRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)} · {state.tokenBalances[character.id]}</option>)}</select><span>gives</span><input aria-label="Token amount" type="number" min="1" value={amount} onChange={event => setAmount(Number(event.target.value))} /><span>to</span><select aria-label="Token recipient" value={toRoleId} onChange={event => setToRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)} · {state.tokenBalances[character.id]}</option>)}</select><button disabled={fromRoleId === toRoleId || amount < 1} onClick={() => run({ name: 'transfer_tokens', payload: { fromRoleId, toRoleId, amount } })}>Record trade</button></div></section>

    <section className="social-panel"><div className="social-heading"><div><span className="kicker">PRIVATE CLUE DESK</span><h3>Sell a clue, then show it only to that role</h3></div><small>{definition.clueDecks.reduce((total, deck) => total + state.clueDecks[deck.id].remainingClueIds.length, 0)} unique clues left</small></div><div className="clue-buyers">{story.characters.map(character => <details key={character.id}><summary><span><b>{liveCharacterName(character, state)}</b><small>{state.tokenBalances[character.id]} tokens · {state.ownedClueIds[character.id].length} clues</small></span><strong>open privately →</strong></summary><div className="clue-options">{definition.clueDecks.map(deck => <button key={deck.id} disabled={Boolean(state.hearing) || state.tokenBalances[character.id] < state.cluePrice || (!state.clueDecks[deck.id].remainingClueIds.length && !state.duplicateClues)} onClick={() => run({ name: 'buy_clue', payload: { roleId: character.id, deckId: deck.id } })}><b>{liveInstructionText(story, state, deck.label)}</b><small>{state.cluePrice} tokens · {state.clueDecks[deck.id].remainingClueIds.length} unique left</small></button>)}</div>{state.ownedClueIds[character.id].map((clueId, index) => <article className="private-clue" key={`${clueId}-${index}`}><span>CLUE {index + 1}</span><p>{liveInstructionText(story, state, clues.get(clueId)?.text ?? clueId)}</p></article>)}</details>)}</div><details className="pacing-tools"><summary>Host pacing help</summary><p>If information is moving too slowly, lower the price or allow repeats after a deck empties.</p><div><button disabled={state.cluePrice === 0} onClick={() => run({ name: 'lower_clue_price', payload: { price: state.cluePrice - 1 } })}>Lower price to {Math.max(0, state.cluePrice - 1)}</button><button disabled={state.duplicateClues} onClick={() => run({ name: 'enable_duplicate_clues' })}>{state.duplicateClues ? 'Repeat clues enabled' : 'Allow repeat clues'}</button></div></details></section>

    <section className="social-panel hearing-panel"><div className="social-heading"><div><span className="kicker">PUBLIC ACCUSATION</span><h3>{state.hearing ? `${characterName(state.hearing.accuserRoleId)} accuses ${characterName(state.hearing.accusedRoleId)}` : 'Call a hearing when someone is ready'}</h3></div>{state.hearing && <strong>{state.hearing.stage.toUpperCase()}</strong>}</div>{state.hearing ? <><aside className="hearing-now"><b>{hearingCopy}</b><p>{state.hearing.caseText}</p></aside>{state.hearing.stage !== 'voting' ? <button className="primary-action" onClick={() => run({ name: 'advance_hearing' })}>Next: {state.hearing.stage === 'case' ? 'the defense' : state.hearing.stage === 'defense' ? 'open statements' : 'the vote'} →</button> : <div className="vote-list">{story.characters.map(character => { const vote = state.hearing?.votes[character.id]; return <article key={character.id}><b>{liveCharacterName(character, state)}</b>{vote ? <strong>{vote}</strong> : <div><button onClick={() => run({ name: 'cast_vote', payload: { roleId: character.id, vote: 'convict' } })}>Convict</button><button onClick={() => run({ name: 'cast_vote', payload: { roleId: character.id, vote: 'acquit' } })}>Acquit</button></div>}</article> })}</div>}</> : <><div className="accusation-form"><label className="field"><span>Accuser</span><select value={accuserRoleId} onChange={event => setAccuserRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)}</option>)}</select></label><label className="field"><span>Accused</span><select value={accusedRoleId} onChange={event => setAccusedRoleId(event.target.value)}>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)}</option>)}</select></label><label className="field case-field"><span>The case in one sentence</span><input value={caseText} onChange={event => setCaseText(event.target.value)} placeholder="I accuse… because…" /></label></div>{state.hearingHistory.at(-1)?.result === 'failed' && <p className="failed-hearing">The last vote failed. Investigation continues.</p>}<button className="primary-action" disabled={accuserRoleId === accusedRoleId || !caseText.trim()} onClick={() => run({ name: 'call_accusation', payload: { accuserRoleId, accusedRoleId, caseText } })}>Begin the public hearing →</button><button className="time-up" onClick={() => run({ name: 'end_investigation' })}>Time is up — reveal without a conviction</button></>}</section>
  </>
}

function AuthoredAct({ definition, state, onConfirm, onUndo, onAdvance }: {
  definition: StorylineDefinition
  state: ActiveGameState
  onConfirm: (stepId: string) => void
  onUndo: (stepId: string) => void
  onAdvance: () => void
}) {
  const act = definition.acts.find(item => item.id === state.playPhase)
  if (!act) return null
  const ready = definition.story.openingSteps
    .every(step => state.completedStepIds.includes(step.id))
  return <section className="phase-panel live-act">
    <header className="live-act-head"><span className="kicker">LIVE HOST GUIDE · ABOUT {act.durationMinutes} MINUTES</span><h2>Guide the room one step at a time.</h2><p>Only the current card needs your attention. The app will reveal the next instruction when you finish it.</p><details><summary>What should I tell the players first?</summary><p>{liveInstructionText(definition.story, state, act.playerGoal)}</p></details></header>
    <RunSheet story={definition.story} state={state} onConfirm={onConfirm} onUndo={onUndo} />
    {ready && <section className="act-finish"><div><span>READY FOR THE NEXT PART</span><h3>{liveInstructionText(definition.story, state, act.operatorGoal)}</h3></div><button disabled={state.paused} onClick={onAdvance}>{liveInstructionText(definition.story, state, act.completionLabel)}</button></section>}
  </section>
}

function TableReveal({ definition, state, run }: { definition: StorylineDefinition; state: ActiveGameState; run: (command: GameCommand) => void }) {
  const { story } = definition
  const scores = calculateScores(definition, state)
  const conviction = state.outcome?.kind === 'conviction' ? state.outcome : null
  const accused = conviction ? liveRoleName(story, state, conviction.accusedRoleId) : undefined
  return <section className="phase-panel reveal-panel"><span className="kicker">10 MINUTES · TABLE REVEAL</span><h2>{accused ? `The room convicted ${accused}.` : 'Time expired without a conviction.'}</h2><p>Now read the real solution, score private objectives, and choose the two table awards.</p><CanonicalTruth story={story} state={state} /><section className="score-room"><div className="social-heading"><div><span className="kicker">FINAL SCORING</span><h3>Tick completed objectives</h3></div><small>Tokens and deduction points are automatic</small></div>{story.characters.map(character => <article key={character.id}><header><div><b>{liveCharacterName(character, state)}</b><small>{state.tokenBalances[character.id]} tokens</small></div><strong>{scores[character.id].total} pts</strong></header><div>{character.objectives.map(objective => <label key={objective.id}><input type="checkbox" checked={state.completedObjectiveIds[character.id].includes(objective.id)} onChange={event => run({ name: 'set_objective_completed', payload: { roleId: character.id, objectiveId: objective.id, completed: event.target.checked } })} /><span>{liveInstructionText(story, state, objective.title)} · {objective.points}</span></label>)}</div><small>Objectives {scores[character.id].objectivePoints} · tokens {scores[character.id].tokenPoints} · deduction {scores[character.id].accuserPoints + scores[character.id].votePoints} · escape {scores[character.id].culpritEscapePoints}</small></article>)}</section><section className="awards"><h3>Two table-voted awards</h3><div className="award-fields"><label className="field"><span>Best performance</span><select value={state.awards.performanceRoleId ?? ''} onChange={event => event.target.value && run({ name: 'record_award', payload: { award: 'performance', roleId: event.target.value } })}><option value="">Choose together</option>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)}</option>)}</select></label><label className="field"><span>Best costume</span><select value={state.awards.costumeRoleId ?? ''} onChange={event => event.target.value && run({ name: 'record_award', payload: { award: 'costume', roleId: event.target.value } })}><option value="">Choose together</option>{story.characters.map(character => <option key={character.id} value={character.id}>{liveCharacterName(character, state)}</option>)}</select></label></div></section><button className="primary-action" disabled={state.paused} onClick={() => run({ name: 'complete' })}>Close the case →</button></section>
}

export function HostWorkspace({ definition, state, issueCode, onCommands, capabilities, gateway, onPreview, onRefresh }: {
  definition: StorylineDefinition
  state: GameState
  issueCode?: string
  onCommands: (commands: GameCommand[]) => Promise<void> | void
  capabilities: RuntimeCapabilities
  gateway: GatewayConnection
  onPreview: (roleId: string) => void
  onRefresh?: () => void
}) {
  const { story } = definition
  const [commandError, setCommandError] = useState('')
  const [setupDraft, setSetupDraft] = useState<SetupDraft | undefined>(state.phase === 'enrolling' ? state.setup : undefined)
  useEffect(() => {
    if (state.phase === 'enrolling') setSetupDraft(state.setup)
  }, [state])
  async function run(command: GameCommand | GameCommand[]) {
    try {
      setCommandError('')
      await onCommands(Array.isArray(command) ? command : [command])
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }
  async function previewSetup(roleId: string) {
    if (!setupDraft) return
    try {
      setCommandError('')
      await onCommands([{ name: 'replace_enrolment', payload: { setup: setupDraft } }])
      onPreview(roleId)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }
  function reset() { if (window.confirm('Reset this game to idle? All assignments and play state will be discarded.')) void run({ name: 'reset', payload: { confirmed: true } }) }

  if (state.phase === 'idle') return <main className="page host-page"><section className="setup-hero idle-hero"><span className="kicker">READY FOR {definition.setting.venueName.toUpperCase()}</span><h1>Assign names, then open the dossiers.</h1><p>No assumed headcount, account IDs, or delivery receipts. You decide who takes which role and how the PDFs reach them.</p><EveningTimeline definition={definition} /><button className="primary-action" onClick={() => void run({ name: 'create' })}>Assign roles →</button></section></main>

  const active = state.phase === 'active' ? state : null
  const hostName = state.phase === 'enrolling' ? state.setup.hostName : state.hostName
  const activeAct = active ? definition.acts.find(act => act.id === active.playPhase) : undefined
  return <main className="page host-page">
    <section className="session-head"><div><span className="kicker">{active ? 'YOU ARE HOSTING' : `GAME ${state.id.slice(0, 8)}`}</span><h1>{active ? `${active.paused ? 'Paused · ' : ''}${liveInstructionText(story, active, activeAct?.title ?? active.playPhase)}` : state.phase}</h1><p>{state.phase === 'enrolling' ? 'Assignments are still editable.' : `Host: ${hostName} · ${'roster' in state ? Object.keys(state.roster).length : 0} players`}</p></div><div className="session-actions">{active && <button className="pause-button" onClick={() => void run({ name: 'toggle_pause' })}>{active.paused ? 'Resume game' : 'Pause game'}</button>}<details><summary>Game controls</summary><div>{state.phase !== 'completed' && state.phase !== 'aborted' && <button className="danger-button" onClick={() => void run({ name: 'abort' })}>Abort</button>}<button className="danger-button" onClick={reset}>Reset game</button></div></details></div></section>
    {commandError && <section className="hard-errors compact"><span>COMMAND FAILED</span><pre>{commandError}</pre></section>}
    {state.phase === 'enrolling' && setupDraft && <SetupPanel definition={definition} setup={setupDraft} issueCode={issueCode} capabilities={capabilities} onChange={setSetupDraft} onPreview={roleId => void previewSetup(roleId)} onRefresh={onRefresh} onPrepare={() => void run([{ name: 'replace_enrolment', payload: { setup: setupDraft } }, { name: 'prepare' }])} />}
    {state.phase === 'prepared' && <><Roster story={story} state={state} onPreview={onPreview} /><DossierDesk definition={definition} state={state} onStart={() => void run({ name: 'start' })} onPreview={onPreview} /></>}
    {active && <>
      <AuthoredAct definition={definition} state={active} onConfirm={stepId => void run({ name: 'complete_opening_step', payload: { stepId } })} onUndo={stepId => void run({ name: 'undo_opening_step', payload: { stepId } })} onAdvance={() => void run({ name: 'advance_act' })} />
      {active.playPhase === 'investigation' && <section className="phase-panel"><Investigation definition={definition} state={active} run={run} /></section>}
      {active.playPhase === 'reveal' && <TableReveal definition={definition} state={active} run={run} />}
      <details className="host-reference"><summary><span>Need to look something up?</span><b>Players, dossiers &amp; full evening <i aria-hidden="true">＋</i></b></summary><EveningTimeline definition={definition} phase={active.playPhase} assignments={active} /><Roster story={story} state={active} onPreview={onPreview} /></details>
    </>}
    {state.phase === 'completed' && <section className="phase-panel terminal"><span className="kicker">CASE CLOSED</span><h2>That’s the evening.</h2><div className="final-score-grid">{Object.values(state.finalScores).sort((a, b) => b.total - a.total).map((score, index) => <article key={score.roleId}><span>{index + 1}</span><div><b>{liveRoleName(story, state, score.roleId)}</b><small>{score.objectivePoints} objectives · {score.tokenPoints} tokens · {score.accuserPoints + score.votePoints} deduction</small></div><strong>{score.total}</strong></article>)}</div></section>}
    {state.phase === 'aborted' && <section className="phase-panel terminal"><span className="kicker danger">GAME ABORTED</span><h2>No further commands can run.</h2><p>Reset explicitly to return to idle.</p></section>}
  </main>
}

export function App() {
  const [storylines, setStorylines] = useState<StorylineDefinition[]>([])
  const [games, setGames] = useState<GameSessionEntry[]>([])
  const [gameVersions, setGameVersions] = useState<Record<string, number>>({})
  const [gameIssueCodes, setGameIssueCodes] = useState<Record<string, string>>({})
  const [selectedStorylineFingerprint, setSelectedStorylineFingerprint] = useState<string>()
  const [activeGameId, setActiveGameId] = useState<string>()
  const [mode, setMode] = useState<Mode>('choose')
  const [previewing, setPreviewing] = useState(false)
  const [selected, setSelected] = useState('')
  const activeGame = games.find(game => game.state.id === activeGameId)
  const selectedStoryline = storylines.find(storyline => storyline.fingerprint === selectedStorylineFingerprint) ?? storylines[0]
  const [storageError, setStorageError] = useState('')
  const [libraryWarning, setLibraryWarning] = useState('')
  const [importError, setImportError] = useState('')
  const [gateway, setGateway] = useState<GatewayConnection>({ state: 'checking' })
  const [libraryReady, setLibraryReady] = useState(false)
  const capabilities = webRuntimeCapabilities

  useEffect(() => {
    let cancelled = false
    async function hydrateLibrary() {
      try {
        let remoteStorylines = await readRemoteStorylines()
        if (!localStorage.getItem(serverMigrationKey)) {
          const local = readGameLibrary(localStorage, [])
          if (local.error) {
            setLibraryWarning(`An older browser library could not be migrated: ${local.error}`)
          } else {
            if (local.storylines.length || local.games.length) {
              await importRemoteLibrary(local.storylines, local.games.map(game => ({
                storyline: game.storyline,
                state: game.state,
              })))
              remoteStorylines = await readRemoteStorylines()
              setLibraryWarning('Your old storylines were copied into quarantine. Old games were not restored because they do not have playability passports.')
            }
            localStorage.setItem(serverMigrationKey, new Date().toISOString())
          }
        }
        const remoteGames = await readRemoteGames()
        if (cancelled) return
        const byFingerprint = new Map(remoteStorylines.map(storyline => [storyline.fingerprint, storyline]))
        const entries = remoteGames.flatMap(game => {
          const storyline = byFingerprint.get(game.storylineFingerprint)
          return storyline ? [bindGameToStoryline(storyline, game.state)] : []
        })
        setStorylines(remoteStorylines)
        setGames(entries)
        setGameVersions(Object.fromEntries(remoteGames.map(game => [game.id, game.version])))
        setSelectedStorylineFingerprint(current => current && byFingerprint.has(current)
          ? current
          : remoteStorylines[0]?.fingerprint)
        setStorageError('')
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setLibraryReady(true)
      }
    }
    void hydrateLibrary()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    readAiGatewayStatus(controller.signal)
      .then(status => setGateway(status.available ? { state: 'available', model: status.model } : { state: 'unavailable' }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setGateway({ state: 'unavailable' }) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (mode !== 'host' || !activeGame || activeGame.state.phase !== 'enrolling' || gameIssueCodes[activeGame.state.id]) return
    let cancelled = false
    readRemoteIssueCode(activeGame.state.id)
      .then(issueCode => {
        if (!cancelled) setGameIssueCodes(current => ({ ...current, [activeGame.state.id]: issueCode }))
      })
      .catch(error => {
        if (!cancelled) setImportError(error instanceof Error ? error.message : String(error))
      })
    return () => { cancelled = true }
  }, [activeGame, gameIssueCodes, mode])

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
      const definition = createStorylineDefinition(JSON.parse(await file.text()) as StorylineDefinitionInput)
      setLibraryWarning(`Reviewing ${definition.story.title}. It will appear only after the complete certification passes.`)
      const certified = await certifyRemoteStoryline(definition)
      const available = await readRemoteStorylines()
      setStorylines(available)
      selectStoryline(certified)
      setLibraryWarning(`${certified.story.title} passed certification and is ready to play.`)
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
  async function saveStoryline(next: StorylineDefinition) {
    try {
      const available = await readRemoteStorylines()
      const saved = available.find(storyline => storyline.fingerprint === next.fingerprint)
      if (!saved) throw new Error('The generated storyline was not certified in the server library. Generate it again.')
      setStorylines(available)
      selectStoryline(saved)
      setImportError('')
      setMode('choose')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }
  async function startGameFromStoryline(storyline: StorylineDefinition) {
    try {
      const game = await createRemoteGame(storyline.fingerprint)
      setGames(current => [...current, bindGameToStoryline(storyline, game.state)])
      setGameVersions(current => ({ ...current, [game.id]: game.version }))
      selectStoryline(storyline)
      setActiveGameId(game.id)
      setImportError('')
      setMode('host')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    }
  }
  function continueGame(entry: GameSessionEntry) {
    selectStoryline(entry.storyline)
    setActiveGameId(entry.state.id)
    setMode('host')
  }
  async function refreshActiveGame() {
    if (!activeGame) return
    const refreshed = await readRemoteGame(activeGame.state.id)
    const entry = bindGameToStoryline(activeGame.storyline, refreshed.state)
    setGames(current => current.map(item => item.state.id === refreshed.id ? entry : item))
    setGameVersions(current => ({ ...current, [refreshed.id]: refreshed.version }))
  }
  async function dispatchActiveGame(commands: GameCommand[]) {
    if (!activeGame) return
    let version = gameVersions[activeGame.state.id]
    if (!version) throw new Error('The server version for this game is missing. Refresh the library and try again.')
    let entry = activeGame
    for (const command of commands) {
      try {
        const result = await runRemoteGameCommand(entry.state.id, version, command)
        if (result.deleted) {
          setGames(current => current.filter(item => item.state.id !== entry.state.id))
          setGameVersions(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== entry.state.id)))
          setActiveGameId(undefined)
          setMode('choose')
          return
        }
        if (!result.game) throw new Error('The server did not return the updated game.')
        version = result.game.version
        entry = bindGameToStoryline(entry.storyline, result.game.state)
        setGames(current => current.map(item => item.state.id === entry.state.id ? entry : item))
        setGameVersions(current => ({ ...current, [entry.state.id]: version }))
      } catch (error) {
        if (error instanceof LibraryApiError && error.code === 'version_conflict') {
          if (error.currentGame) {
            const currentGame = error.currentGame
            setGames(current => current.map(item => item.state.id === currentGame.id
              ? bindGameToStoryline(item.storyline, currentGame.state)
              : item))
            setGameVersions(current => ({ ...current, [currentGame.id]: currentGame.version }))
            throw new Error('This game changed in another tab. The latest state has been loaded; review it and try again.')
          }
          setGames(current => current.filter(item => item.state.id !== entry.state.id))
          setGameVersions(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== entry.state.id)))
          setActiveGameId(undefined)
          setMode('choose')
          throw new Error('This game was removed in another tab. The library has been refreshed.')
        }
        throw error
      }
    }
  }

  if (storageError) return <main className="fatal-screen"><span className="kicker danger">LIBRARY UNAVAILABLE</span><h1>The server-backed game library could not be opened.</h1><pre>{storageError}</pre><button onClick={() => window.location.reload()}>Try again</button></main>
  if (!libraryReady) return <main className="fatal-screen"><span className="kicker">OPENING LIBRARY</span><h1>Loading your storylines and games…</h1></main>
  if (mode === 'author') return <AuthoringStudio gateway={gateway} onExit={() => setMode('choose')} onSave={saveStoryline} saveError={importError} />
  if (mode === 'rules' && selectedStoryline) return <Rules definition={selectedStoryline} onExit={() => setMode('choose')} />
  if (mode === 'god' && activeGame) return <GodView game={activeGame} onExit={() => setMode('host')} />
  if (previewing && activeGame) {
    const player = activeGame.storyline.story.characters.find(item => item.id === selected) ?? activeGame.storyline.story.characters[0]
    const liveState = activeGame.state.phase === 'active' || activeGame.state.phase === 'completed' ? activeGame.state : undefined
    const assignee = liveState?.roster[player.id]?.displayName
    const playerName = assignee ? `${player.name} (${assignee})` : player.name
    const formatText = liveState ? (text: string) => liveInstructionText(activeGame.storyline.story, liveState, text) : undefined
    const visiblePublicEvidenceIds = liveState?.playPhase === 'investigation' || liveState?.playPhase === 'reveal'
      ? liveState.revealedEvidenceIds
      : []
    const clueSources = activeGame.storyline.clueDecks.map(deck => ({ label: deck.label, clueCount: deck.clues.length }))
    return <main className="page player-page host-preview"><div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to host dashboard</button><span>HOST PREVIEW · {playerName}</span></div><PlayerProfile story={activeGame.storyline.story} character={player} visiblePublicEvidenceIds={visiblePublicEvidenceIds} clueSources={clueSources} assignee={assignee} formatText={formatText} onExit={() => setPreviewing(false)} /></main>
  }
  if (mode === 'host' && activeGame) {
    const { storyline, state } = activeGame
    return <><ActiveGameBar game={activeGame} onGodView={() => setMode('god')} onExit={() => setMode('choose')} /><HostWorkspace definition={storyline} state={state} issueCode={gameIssueCodes[state.id]} onCommands={dispatchActiveGame} capabilities={capabilities} gateway={gateway} onPreview={preview} onRefresh={() => void refreshActiveGame()} /></>
  }
  return <StartScreen storylines={storylines} games={games} importError={importError} libraryWarning={libraryWarning} onCreateStoryline={() => setMode('author')} onCreateGame={storyline => void startGameFromStoryline(storyline)} onContinueGame={continueGame} onRules={storyline => showStoryline(storyline, 'rules')} onImport={importStoryline} onExport={exportStoryline} />
}
