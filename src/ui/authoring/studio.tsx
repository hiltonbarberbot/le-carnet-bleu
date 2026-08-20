import { useState } from 'react'
import { draftStorylineFromSetting } from '../../game/ai/author'
import { createSettingFromSeed } from '../../game/ai/setting'
import type { StorylineDefinition } from '../../game/definition/contract'
import { createSettingBrief } from '../../game/setting/brief'
import { describeDraftFailure, type DraftFailure, type DraftingStage } from './failure'
import './studio.css'

type AuthoringStudioProps = {
  gateway: { state: 'checking' | 'available' | 'unavailable'; model?: string }
  onExit: () => void
  onSave: (storyline: StorylineDefinition) => void
}

type StudioStage = 'idle' | DraftingStage

export function AuthoringStudio({ gateway, onExit, onSave }: AuthoringStudioProps) {
  const [prompt, setPrompt] = useState('')
  const [failure, setFailure] = useState<DraftFailure>()
  const [draftingStage, setDraftingStage] = useState<StudioStage>('idle')
  const [draft, setDraft] = useState<StorylineDefinition>()

  const drafting = draftingStage !== 'idle'

  async function createDraft() {
    if (!prompt.trim()) {
      setFailure({
        title: 'Give us a seed first',
        message: 'One line about the place, mood, or premise is enough.',
        help: 'Your notes can be rough. We’ll shape the rest.',
        stage: 'setting',
        retryable: false,
      })
      return
    }
    if (gateway.state !== 'available') {
      setFailure({
        title: 'Drafting isn’t connected',
        message: 'AI drafting is not available on this deployment.',
        help: 'The deployment owner needs to connect the AI Gateway.',
        stage: 'setting',
        retryable: false,
      })
      return
    }

    let failedStage: DraftingStage = 'setting'
    setFailure(undefined)
    setDraftingStage('setting')
    try {
      const setting = createSettingBrief(await createSettingFromSeed(prompt.trim()))
      failedStage = 'story'
      setDraftingStage('story')
      setDraft(await draftStorylineFromSetting(setting))
    } catch (error) {
      setFailure(describeDraftFailure(error, failedStage))
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
      <div className="draft-facts"><span><b>{draft.story.characters.length}</b> suspects</span><span><b>{draft.story.openingSteps.length}</b> opening steps</span><span><b>{draft.story.solutionSteps.length}</b> solution steps</span></div>
      <div className="draft-actions"><button className="use-draft" onClick={() => onSave(draft)}>Save storyline to library →</button></div>
    </section>
  </main>

  const buttonLabel = draftingStage === 'setting'
    ? 'Figuring out the setting…'
    : draftingStage === 'story'
      ? 'Writing your mystery…'
      : failure?.retryable ? 'Try again →' : 'Make my mystery →'

  return <main className="author-studio author-seed-studio">
    <button className="author-back" onClick={onExit}>← Back</button>
    <section className="author-seed-card">
      <span className="kicker">CREATE WITH AI</span>
      <h1>Seed the whole game.</h1>
      <p>One sentence is enough. Give us the place, mood, or premise—whatever you know. We’ll invent the gathering with the story.</p>
      <label className="author-prompt">
        <span className="sr-only">Your mystery seed</span>
        <textarea autoFocus spellCheck value={prompt} onChange={event => { setPrompt(event.target.value); setFailure(undefined) }} placeholder="A house in Grambois. 1960s spy mystery, elegant and funny." />
      </label>
      <div className="author-prompt-meta"><span>Messy is fine. Short is fine.</span><span>{prompt.trim().length ? `${prompt.trim().length} characters` : 'Start anywhere'}</span></div>
      {failure && <section className="author-errors compact" role="alert" aria-live="assertive">
        <div className="author-error-heading"><b>{failure.title}</b><span>{failure.stage === 'setting' ? 'Setting setup' : 'Story writing'}</span></div>
        <p>{failure.message}</p>
        <p className="author-error-help">{failure.help}</p>
        {failure.reference && <small>Reference {failure.reference}</small>}
      </section>}
      <button className="author-shape" disabled={drafting || gateway.state !== 'available'} onClick={createDraft}>{buttonLabel}</button>
      {gateway.state !== 'available' && <p className={`author-ai-note ${gateway.state}`}>{gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</p>}
    </section>
  </main>
}
