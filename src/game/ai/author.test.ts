import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText, streamText } from 'ai'
import { GET, POST } from './server/author'
import { createDemoStoryline, demoSetting } from '../demo'
import { createSettingBrief } from '../setting/brief'
import { createStorylineDefinition } from '../definition/create'
import { logicCheckIds, type StoryLogicReview } from '../story/review/contract'
import {
  rehearsalJudgeCheckIds,
  type HostRehearsalReport,
  type RehearsalJudgeReview,
  type RoleRehearsalReport,
} from '../story/rehearsal'

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateText: vi.fn(), streamText: vi.fn() }
})

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  delete process.env.VERCEL
  vi.clearAllMocks()
})

function request(setting: unknown) {
  return new Request('https://example.test/api/ai/author', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setting }),
  })
}

function generatedDefinition() {
  const { fingerprint: _fingerprint, schemaVersion: _schemaVersion, ...definition } = createDemoStoryline('ai-authored')
  return definition
}

function streamResult(output: unknown, text = JSON.stringify(output)) {
  return {
    output: Promise.resolve(output),
    text: Promise.resolve(text),
  } as never
}

function failedStructuredStream(text: string) {
  return {
    text: Promise.resolve(text),
  } as never
}

function passingReview(definition = createDemoStoryline('ai-authored')): StoryLogicReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    verdict: 'pass',
    summary: 'The case is coherent and fairly solvable.',
    checks: logicCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function passingHostRehearsal(definition = createDemoStoryline('ai-authored')): HostRehearsalReport {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    status: 'ready',
    summary: 'The host can execute the authored game without repair.',
    setupAssessments: definition.setupRequirements.map(requirement => ({ requirementId: requirement.id, feasibility: 'feasible', execution: 'Prepare the referenced verified resource.', blockers: [] })),
    openingAssessments: definition.story.openingSteps.map(step => ({ stepId: step.id, feasibility: 'feasible', execution: 'Follow and complete the authored host cue.', blockers: [] })),
    runtimeAssessment: { feasibility: 'feasible', execution: 'Operate the session commands through scoring and completion.', blockers: [] },
    revealAssessment: { feasibility: 'feasible', execution: 'Deliver the complete authored causal reveal.', blockers: [] },
    repairRisks: [],
  }
}

function passingRoleRehearsal(roleIndex: number, definition = createDemoStoryline('ai-authored')): RoleRehearsalReport {
  const role = definition.story.characters[roleIndex]
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    participantRef: `player-${roleIndex + 1}`,
    status: 'ready',
    summary: 'I have actionable information and feasible objectives.',
    actionableFacts: [{ factId: role.secrets[0]?.id ?? definition.story.publicEvidence[0].id, canShare: true, intendedUse: 'Trade it for independent corroboration.' }],
    objectiveAssessments: role.objectives.map(objective => ({ objectiveId: objective.id, feasibility: 'feasible', route: 'Pursue this through voluntary free-play conversation.', blockers: [] })),
    investigationMoves: ['Compare accounts with another suspect.'],
    questionsToPursue: ['Who can corroborate the timeline?'],
    deductionRisks: [],
  }
}

function passingRehearsalJudge(definition = createDemoStoryline('ai-authored')): RehearsalJudgeReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    verdict: 'pass',
    summary: 'The isolated host and players can complete and solve the authored game.',
    checks: rehearsalJudgeCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function mockPassingRehearsal(definition = createDemoStoryline('ai-authored')) {
  vi.mocked(generateText).mockResolvedValueOnce({ output: passingHostRehearsal(definition) } as never)
  for (let roleIndex = 0; roleIndex < 5; roleIndex += 1) {
    vi.mocked(generateText).mockResolvedValueOnce({ output: passingRoleRehearsal(roleIndex, definition) } as never)
  }
  for (let round = 1; round <= 3; round += 1) {
    for (let roleIndex = 0; roleIndex < 5; roleIndex += 1) {
      const nextRoleId = definition.story.characters[(roleIndex + 1) % definition.story.characters.length].id
      const output = round === 1
        ? { action: 'share_fact', factId: definition.story.characters[roleIndex].secrets[0].id, targetRoleId: '', deckId: '', accusedRoleId: '', caseFactIds: [], words: 'I share a concrete fact with the table.' }
        : round === 2
          ? { action: 'accuse', factId: '', targetRoleId: '', deckId: '', accusedRoleId: nextRoleId, caseFactIds: [definition.story.publicEvidence[0].id, definition.story.characters[0].secrets[0].id], words: 'These known facts support my accusation.' }
          : { action: 'ask', factId: '', targetRoleId: nextRoleId, deckId: '', accusedRoleId: '', caseFactIds: [], words: 'Please explain how your timeline fits these facts.' }
      vi.mocked(generateText).mockResolvedValueOnce({ output } as never)
    }
  }
  vi.mocked(generateText).mockResolvedValueOnce({ output: passingRehearsalJudge(definition) } as never)
}

function mockPassingDraft(draft = generatedDefinition()) {
  vi.mocked(streamText).mockReturnValueOnce(streamResult(draft))
  vi.mocked(generateText).mockResolvedValueOnce({ output: passingReview() } as never)
  mockPassingRehearsal()
}

describe('AI story authoring function', () => {
  it('fails closed without Gateway authentication', async () => {
    expect(await GET().json()).toEqual({ available: false })
    expect((await POST(request(demoSetting))).status).toBe(503)
  })

  it('rejects an incomplete setting before asking the model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const response = await POST(request({ venueName: 'Somewhere' }))
    expect(response.status).toBe(400)
    expect(generateText).not.toHaveBeenCalled()
    expect(streamText).not.toHaveBeenCalled()
  })

  it('validates and fingerprints the generated definition', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    mockPassingDraft()
    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.definition.fingerprint).toHaveLength(32)
    expect(payload.definition.story.characters).toHaveLength(5)
    expect(streamText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: 'openai/gpt-5.6-sol-fast',
      maxOutputTokens: 24000,
    }))
    expect(generateText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: 'anthropic/claude-sonnet-5',
      temperature: 0,
    }))
    expect(generateText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: 'google/gemini-3.7-flash',
      temperature: 0,
    }))
    expect(generateText).toHaveBeenNthCalledWith(23, expect.objectContaining({
      model: 'anthropic/claude-sonnet-5',
      temperature: 0,
    }))
    expect(payload.readiness).toEqual(expect.objectContaining({
      status: 'playable',
      definitionFingerprint: payload.definition.fingerprint,
      deterministicReview: expect.objectContaining({
        status: 'passed',
        playthrough: expect.objectContaining({ verdict: 'pass' }),
      }),
      independentReview: expect.objectContaining({ status: 'passed', model: 'anthropic/claude-sonnet-5' }),
      playabilityRehearsal: expect.objectContaining({
        status: 'passed',
        roleModel: 'google/gemini-3.7-flash',
        hostModel: 'google/gemini-3.7-flash',
        tableModel: 'google/gemini-3.7-flash',
        judgeModel: 'anthropic/claude-sonnet-5',
      }),
    }))
    expect(payload.logicReview).toEqual(expect.objectContaining({ verdict: 'pass', model: 'anthropic/claude-sonnet-5' }))
  })

  it('composes five bounded dossiers onto a compact causal blueprint', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const full = generatedDefinition()
    const details = full.story.characters.map(character => ({
      costume: character.costume,
      publicFace: character.publicFace,
      invitationPretext: character.invitationPretext,
      invitationPromise: character.invitationPromise,
      privateIdentity: character.privateIdentity,
      privateSecret: character.privateSecret,
      traits: character.traits,
      objectives: character.objectives,
      relationships: character.relationships,
    }))
    const compact = {
      ...full,
      story: {
        ...full.story,
        characters: full.story.characters.map(character => ({
          id: character.id,
          name: character.name,
          title: character.title,
          secrets: character.secrets,
        })),
      },
    }
    vi.mocked(streamText).mockReturnValueOnce(streamResult(compact))
    details.forEach(detail => vi.mocked(streamText).mockReturnValueOnce(streamResult(detail)))
    const expected = createStorylineDefinition({
      ...full,
      story: {
        ...full.story,
        characters: full.story.characters.map(character => {
          const { privateObjective: _privateObjective, ...rest } = character
          return rest
        }),
      },
    })
    vi.mocked(generateText).mockResolvedValueOnce({ output: passingReview(expected) } as never)
    mockPassingRehearsal(expected)

    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.definition.story.characters).toEqual(expected.story.characters)
    expect(streamText).toHaveBeenCalledTimes(6)
    expect(streamText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: 'openai/gpt-5.6-sol-fast',
      maxOutputTokens: 5000,
    }))
  })

  it('keeps the host-validated setting authoritative over model output', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const draft = generatedDefinition()
    draft.setting = {
      ...draft.setting,
      venueName: 'Invented model venue',
      playableSpaces: [
        ...draft.setting.playableSpaces,
        { id: 'invented-room', label: 'Invented room', description: 'This was never approved by the host.' },
      ],
    }
    mockPassingDraft(draft)

    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.definition.setting).toEqual(createSettingBrief(demoSetting))
    expect(payload.definition.setting.venueName).not.toBe('Invented model venue')
    expect(payload.definition.setting.playableSpaces).not.toContainEqual(expect.objectContaining({ id: 'invented-room' }))
  })

  it('rejects story references to setting resources invented by the model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const draft = generatedDefinition()
    draft.setting.playableSpaces.push({ id: 'invented-room', label: 'Invented room', description: 'Not host-approved.' })
    draft.clueDecks[0].source = { kind: 'playableSpaces', id: 'invented-room' }
    vi.mocked(streamText).mockReturnValue(streamResult(draft))

    const response = await POST(request(demoSetting))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'invalid_output' }))
    expect(streamText).toHaveBeenCalledTimes(2)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('accepts fenced JSON with a trailing comma', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const text = `${JSON.stringify(generatedDefinition(), null, 2).replace(/\n}$/, ',\n}')}`
    vi.mocked(streamText).mockReturnValueOnce(failedStructuredStream(`\`\`\`json\n${text}\n\`\`\``))
    vi.mocked(generateText).mockResolvedValueOnce({ output: passingReview() } as never)
    mockPassingRehearsal()

    const response = await POST(request(demoSetting))

    expect(response.status).toBe(200)
  })

  it('feeds a rejected review into one fresh draft, then returns a durable blocked verdict', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    const failedReview = passingReview()
    failedReview.verdict = 'fail'
    failedReview.checks.find(check => check.id === 'means')!.verdict = 'fail'
    failedReview.findings.push({ severity: 'blocking', code: 'missing_means', message: 'The fatal mechanism is not established.', relatedIds: [] })
    vi.mocked(streamText)
      .mockReturnValueOnce(streamResult(generatedDefinition()))
      .mockReturnValueOnce(streamResult(generatedDefinition()))
    vi.mocked(generateText)
      .mockResolvedValueOnce({ output: failedReview } as never)
      .mockResolvedValueOnce({ output: failedReview } as never)

    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.readiness).toEqual(expect.objectContaining({
      status: 'blocked',
      independentReview: expect.objectContaining({ status: 'rejected' }),
    }))
    expect(streamText).toHaveBeenCalledTimes(2)
    expect(generateText).toHaveBeenCalledTimes(2)
    expect(vi.mocked(streamText).mock.calls[1][0].prompt).toContain('"code": "missing_means"')
    expect(vi.mocked(streamText).mock.calls[1][0].prompt).toContain('"message": "The fatal mechanism is not established."')
  })

  it('retries a draft that fails the domain checks', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(streamText).mockReturnValue(streamResult({ id: 'broken' }))
    const response = await POST(request(demoSetting))
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload).toEqual(expect.objectContaining({
      code: 'invalid_output',
      retryable: true,
      reference: expect.stringMatching(/^[A-F0-9]{8}$/),
    }))
    expect(payload.error).not.toContain('Setting brief is incomplete')
    expect(streamText).toHaveBeenCalledTimes(2)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('makes a busy provider distinguishable and retryable', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    vi.mocked(streamText).mockImplementation(() => { throw Object.assign(new Error('provider details'), { statusCode: 429 }) })

    const response = await POST(request(demoSetting))

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual(expect.objectContaining({
      code: 'rate_limited',
      retryable: true,
    }))
    expect(streamText).toHaveBeenCalledTimes(1)
    expect(generateText).not.toHaveBeenCalled()
  })
})
