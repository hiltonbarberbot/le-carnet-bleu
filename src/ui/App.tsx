import { useMemo, useState } from 'react'
import { generateGame } from '../game/generate'
import type { Character } from '../game/types'

type View = 'briefing' | 'players' | 'host' | 'truth'

const tabs: { id: View; label: string }[] = [
  { id: 'briefing', label: 'Briefing' }, { id: 'players', label: 'Dossiers' },
  { id: 'host', label: 'Run the night' }, { id: 'truth', label: 'The truth' },
]

function Dossier({ character }: { character: Character }) {
  const [revealed, setRevealed] = useState(false)
  return <article className="dossier">
    <header><span className="stamp">CONFIDENTIAL</span><p>{character.title}</p><h3>{character.name}</h3></header>
    <div className="dossier-grid">
      <div><h4>Public face</h4><p>{character.publicFace}</p><h4>Costume</h4><p>{character.costume}</p></div>
      <div className="secret"><h4>Your real secret</h4><p>{revealed ? character.privateSecret : '••••••••••••••••••••'}</p><button onClick={() => setRevealed(value => !value)}>{revealed ? 'Conceal' : 'Reveal privately'}</button></div>
    </div>
    <h4>What you remember</h4>
    <ol className="memories">{character.memories.map(memory => <li key={memory.id}><span>{memory.kind}</span>{memory.text}</li>)}</ol>
    <h4>Live instructions</h4>
    {character.actions.map(action => <div className="action" key={action.id}><b>{action.cue}</b><p>{action.text}</p></div>)}
  </article>
}

export function App() {
  const params = new URLSearchParams(location.search)
  const [seed, setSeed] = useState(params.get('seed') || 'grambois-bleu')
  const [view, setView] = useState<View>('briefing')
  const [selected, setSelected] = useState('jacques')
  const [completed, setCompleted] = useState<string[]>([])
  const game = useMemo(() => generateGame(seed), [seed])
  const player = game.characters.find(item => item.id === selected) || game.characters[0]
  const coverage = Math.round((game.characters.flatMap(c => c.memories).filter(m => m.kind === 'chain').length / game.characters.flatMap(c => c.memories).length) * 100)

  function shareSeed() {
    const url = new URL(location.href); url.searchParams.set('seed', seed); navigator.clipboard.writeText(url.toString())
  }

  return <>
    <header className="masthead">
      <div className="eyebrow">BUREAU DES AFFAIRES ABSURDES · CASE 06</div>
      <div className="brand"><div className="mark">LCB</div><div><h1>{game.title}</h1><p>{game.subtitle}</p></div></div>
      <div className="seed-box"><label htmlFor="seed">Case seed</label><div><input id="seed" value={seed} onChange={event => setSeed(event.target.value)} /><button onClick={shareSeed}>Copy link</button></div></div>
    </header>
    <nav>{tabs.map(tab => <button className={view === tab.id ? 'active' : ''} onClick={() => setView(tab.id)} key={tab.id}>{tab.label}</button>)}</nav>
    <main>
      {view === 'briefing' && <section className="briefing">
        <div className="hero"><div><span className="kicker">A live dinner-party machine</span><h2>The murder happens<br/><em>because you are playing.</em></h2><p>Players arrive as ludicrous spies and aristocrats. Their memories describe the past. Their secret actions create the present. Only the chronology connects them.</p><button className="primary" onClick={() => setView('players')}>Open the dossiers →</button></div><div className="blue-book"><span>TRÈS SECRET</span><strong>LE<br/>CARNET<br/>BLEU</strong><small>IDENTITÉS · DETTES · TRAHISONS</small></div></div>
        <div className="metrics"><div><strong>{game.characters.length}</strong><span>players + host</span></div><div><strong>{game.timeline.length}</strong><span>truth beats</span></div><div><strong>{coverage}%</strong><span>memories relevant</span></div><div><strong>60</strong><span>seconds of darkness</span></div></div>
        <div className="principles"><article><b>01</b><h3>Past</h3><p>Each dossier contains five memories. Some solve the case; others expose debts, affairs and exceptionally stupid grudges.</p></article><article><b>02</b><h3>Present</h3><p>Secret instructions cause real events at the table: a switched jacket, an open terrace, a stolen napkin, a blackout.</p></article><article><b>03</b><h3>Reconstruction</h3><p>No clue names the culprit. The group must recover most of one objective timeline before contradictions collapse into sense.</p></article></div>
      </section>}
      {view === 'players' && <section><div className="section-head"><div><span className="kicker">Private material</span><h2>Player dossiers</h2></div><select value={selected} onChange={event => setSelected(event.target.value)}>{game.characters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></div><Dossier character={player}/><p className="print-note">Print or send one dossier per player. Never let players browse this screen together.</p></section>}
      {view === 'host' && <section><div className="section-head"><div><span className="kicker">Host eyes only</span><h2>Run the night</h2></div><span className="progress">{completed.length}/{game.characters.flatMap(c => c.actions).length} actions fired</span></div>
        <div className="act"><span>ACT I · YOU ARE THE CONCIERGE</span><h3>Let the nonsense become evidence.</h3><p>Stay in character. Privately cue each player at the right natural moment. Do not explain why. The essential actions are marked in blue.</p></div>
        <div className="run-list">{game.characters.flatMap(character => character.actions.map(action => ({...action, owner: character.name}))).map(action => <label className={action.essential ? 'essential' : ''} key={action.id}><input type="checkbox" checked={completed.includes(action.id)} onChange={() => setCompleted(list => list.includes(action.id) ? list.filter(id => id !== action.id) : [...list, action.id])}/><div><b>{action.cue}</b><h4>{action.owner}</h4><p>{action.text}</p><small>{action.consequence}</small></div></label>)}</div>
        <div className="blackout"><span>THE TURN</span><h3>Lights out. Sixty seconds.</h3><p>Take your place in the study. When the lights return, the Concierge is dead. Step out of character and become game master.</p></div>
      </section>}
      {view === 'truth' && <section><div className="section-head"><div><span className="kicker danger">Spoilers · host only</span><h2>The canonical timeline</h2></div><div className="culprit">CULPRIT<br/><b>{game.culprit}</b></div></div><p className="solution">{game.solution}</p><div className="timeline">{game.timeline.map(item => <article key={item.beat}><span>{String(item.beat).padStart(2,'0')}</span><div><h3>{item.title}</h3><p>{item.truth}</p><small>Evidence: {item.evidence.join(' · ')}</small></div></article>)}</div></section>}
    </main>
    <footer>Deterministic by design · same seed, same case · v0.1</footer>
  </>
}
