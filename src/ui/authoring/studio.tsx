import { useState } from 'react'
import { draftStorylineFromSetting } from '../../game/ai/author'
import { createSettingFromSeed } from '../../game/ai/setting'
import type { StorylineDefinition } from '../../game/definition/contract'
import { createSettingBrief } from '../../game/setting/brief'
import './studio.css'

type AuthoringStudioProps = {
  gateway: { state: 'checking' | 'available' | 'unavailable'; model?: string }
  onExit: () => void
  onSave: (storyline: StorylineDefinition) => void
}

type DraftingStage = 'idle' | 'setting' | 'story'

export function AuthoringStudio({ gateway, onExit, onSave }: AuthoringStudioProps) {
  const [prompt, setPrompt] = useState('')
  const [requestError, setRequestError] = useState('')
  const [draftingStage, setDraftingStage] = useState<DraftingStage>('idle')
  const [draft, setDraft] = useState<StorylineDefinition>()

  const drafting = draftingStage !== 'idle'

  async function createDraft() {
    if (!prompt.trim()) {
      setRequestError('Give us one line to start from.')
      return
    }
    if (gateway.state !== 'available') {
      setRequestError('AI drafting is not available on this deployment.')
      return
    }

    setRequestError('')
    setDraftingStage('setting')
    try {
      const setting = createSettingBrief(await createSettingFromSeed(prompt.trim()))
      setDraftingStage('story')
      setDraft(await draftStorylineFromSetting(setting))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftingStage('idle')
    }
  }

  if (draft) return <main className="author-studio draft-ready">
    <button className="author-back" onClick={() => setDraft(undefined)}>← Try another seed</button>
    <section className="draft-card">
      <span className="kicker">STORYLINE DRAFT · READY TO REVIEW</span>
      <h1>{draft.title}</h1>
      <p>{draft.story.premise}</p>
      <div className="draft-facts"><span><b>{draft.story.characters.length}</b> suspects</span><span><b>{draft.story.runPlan.length}</b> live beats</span><span><b>{draft.story.timeline.length}</b> truth beats</span></div>
      <div className="draft-actions"><button className="use-draft" onClick={() => onSave(draft)}>Save storyline to library →</button></div>
    </section>
  </main>

  const buttonLabel = draftingStage === 'setting'
    ? 'Figuring out the setting…'
    : draftingStage === 'story'
      ? 'Writing your mystery…'
      : 'Make my mystery →'

  return <main className="author-studio author-seed-studio">
    <button className="author-back" onClick={onExit}>← Back</button>
    <section className="author-seed-card">
      <span className="kicker">CREATE WITH AI</span>
      <h1>Seed the whole game.</h1>
      <p>One sentence is enough. Give us the place, mood, occasion, or premise—whatever you know. We’ll figure out the practical details.</p>
      <label className="author-prompt">
        <span className="sr-only">Your mystery seed</span>
        <textarea autoFocus spellCheck value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="A decadent dinner in Grambois. Present-day spy mystery, elegant and funny." />
      </label>
      <div className="author-prompt-meta"><span>Messy is fine. Short is fine.</span><span>{prompt.trim().length ? `${prompt.trim().length} characters` : 'Start anywhere'}</span></div>
      {requestError && <section className="author-errors compact"><b>Couldn’t make the draft</b><p>{requestError}</p></section>}
      <button className="author-shape" disabled={drafting || gateway.state !== 'available'} onClick={createDraft}>{buttonLabel}</button>
      {gateway.state !== 'available' && <p className={`author-ai-note ${gateway.state}`}>{gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</p>}
    </section>
  </main>
}
