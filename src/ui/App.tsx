import { useMemo, useState } from 'react'
import { generateGame } from '../game/generate'
import type { Character } from '../game/types'

type Mode = 'choose' | 'host' | 'player'
type HostPage = 'run' | 'truth'

function PlayerProfile({ character, onExit }: { character: Character; onExit?: () => void }) {
  return <>
    <div className="mode-bar player-mode">
      <div><span>PLAYER PROFILE</span><b>You are viewing only {character.name}’s information</b></div>
      <div className="mode-actions">
        <button onClick={() => window.print()}>Download / print PDF</button>
        {onExit && <button className="quiet" onClick={onExit}>Exit profile</button>}
      </div>
    </div>
    <article className="profile">
      <header>
        <div><span className="label">YOUR CHARACTER</span><p>{character.title}</p><h1>{character.name}</h1></div>
        <span className="stamp">PRIVATE</span>
      </header>

      <section className="start-here">
        <span className="number">1</span><div><h2>Who you are</h2><p>{character.publicFace}</p><p><b>Your secret:</b> {character.privateSecret}</p><p><b>Wear:</b> {character.costume}</p></div>
      </section>

      <section>
        <div className="profile-heading"><span className="number">2</span><div><h2>What you know</h2><p>These are your memories. Share, hide or lie about them as you wish.</p></div></div>
        <div className="plain-list">{character.memories.map(memory => <div key={memory.id}>{memory.text}</div>)}</div>
      </section>

      <section>
        <div className="profile-heading"><span className="number red">3</span><div><h2>What you must do</h2><p>Do these naturally when the cue happens. Do not explain why.</p></div></div>
        <div className="task-list">{character.actions.map(action => <article key={action.id}><b>WHEN: {action.cue}</b><p>{action.text}</p></article>)}</div>
      </section>
    </article>
  </>
}

export function App() {
  const params = new URLSearchParams(location.search)
  const [seed, setSeed] = useState(params.get('seed') || 'grambois-bleu')
  const [mode, setMode] = useState<Mode>('choose')
  const [hostPage, setHostPage] = useState<HostPage>('run')
  const [selected, setSelected] = useState('jacques')
  const [completed, setCompleted] = useState<string[]>([])
  const game = useMemo(() => generateGame(seed), [seed])
  const player = game.characters.find(item => item.id === selected) || game.characters[0]
  const actions = game.characters.flatMap(character => character.actions.map(action => ({ ...action, owner: character.name })))

  function copyGameLink() {
    const url = new URL(location.href)
    url.searchParams.set('seed', seed)
    navigator.clipboard.writeText(url.toString())
  }

  if (mode === 'choose') return <main className="chooser">
    <span className="kicker">LE CARNET BLEU</span>
    <h1>Who is using this screen?</h1>
    <p>Choose carefully. Host mode contains the solution.</p>
    <div className="mode-cards">
      <button onClick={() => setMode('host')}><span>HOST ONLY</span><b>Enter god mode</b><small>Run the night, see every action and reveal the truth.</small></button>
      <button onClick={() => setMode('player')}><span>ONE PLAYER</span><b>Open a profile</b><small>See exactly what one character needs to know and do.</small></button>
    </div>
    <div className="case-seed"><label>Game seed</label><input value={seed} onChange={event => setSeed(event.target.value)} /><button onClick={copyGameLink}>Copy game link</button></div>
  </main>

  if (mode === 'player') return <main className="page player-page">
    <div className="profile-picker"><label>Choose your character</label><select value={selected} onChange={event => setSelected(event.target.value)}>{game.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div>
    <PlayerProfile character={player} onExit={() => setMode('choose')} />
  </main>

  return <>
    <header className="mode-bar host-mode">
      <div><span>GOD MODE · HOST EYES ONLY</span><b>You can see every secret and the full solution</b></div>
      <div className="mode-actions"><button className="quiet" onClick={() => setMode('player')}>Preview player profiles</button><button className="quiet" onClick={() => setMode('choose')}>Exit god mode</button></div>
    </header>
    <nav className="host-nav"><button className={hostPage === 'run' ? 'active' : ''} onClick={() => setHostPage('run')}>1. Run the game</button><button className={hostPage === 'truth' ? 'active' : ''} onClick={() => setHostPage('truth')}>2. Reveal the solution</button></nav>
    <main className="page host-page">
      {hostPage === 'run' ? <>
        <div className="page-title"><div><span className="kicker">YOUR JOB</span><h1>Make these actions happen.</h1><p>Stay as the Concierge. Cue each player. Tick it off. Then trigger the blackout.</p></div><b>{completed.length}/{actions.length} done</b></div>
        <div className="host-steps"><article><b>1</b><span>Give each guest only their own PDF profile.</span></article><article><b>2</b><span>During dinner, cue the actions below in order.</span></article><article><b>3</b><span>After the blackout, become game master.</span></article></div>
        <div className="run-list">{actions.map(action => <label className={action.essential ? 'essential' : ''} key={action.id}><input type="checkbox" checked={completed.includes(action.id)} onChange={() => setCompleted(list => list.includes(action.id) ? list.filter(id => id !== action.id) : [...list, action.id])}/><div><small>{action.cue}</small><h3>{action.owner}</h3><p>{action.text}</p><em>What it causes: {action.consequence}</em></div></label>)}</div>
        <button className="blackout" onClick={() => setHostPage('truth')}><span>FINAL HOST ACTION</span><b>Kill the lights for 60 seconds</b><small>When they return, the Concierge is dead. Open the solution →</small></button>
      </> : <>
        <div className="page-title"><div><span className="kicker danger">SPOILERS</span><h1>What actually happened.</h1></div><b className="culprit">CULPRIT: {game.culprit}</b></div>
        <p className="solution">{game.solution}</p>
        <div className="timeline">{game.timeline.map(item => <article key={item.beat}><span>{item.beat}</span><div><h3>{item.title}</h3><p>{item.truth}</p><small>Proof: {item.evidence.join(' · ')}</small></div></article>)}</div>
      </>}
    </main>
  </>
}
