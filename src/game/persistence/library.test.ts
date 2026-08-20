import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { createGameRuntime } from '../runtime/game'
import { logicCheckIds, type StoryLogicReview } from '../story/review/contract'
import { evaluateStorylineReadiness, type StorylineReadinessVerdict } from '../story/review/readiness'
import {
  rehearseStoryline,
  rehearsalJudgeCheckIds,
  type HostRehearsalReport,
  type RehearsalJudgeReview,
  type RoleRehearsalReport,
} from '../story/rehearsal'
import type {
  GameLibraryRepository,
  LibraryImport,
  LibraryScope,
  NewPersistedGame,
  PersistedGame,
} from './repository'
import {
  createPersistedGame,
  certifyValidatedStoryline,
  executePersistedGameCommand,
  importPersistedLibrary,
  listAvailableStorylines,
  StorylineNotPlayableError,
} from './library'

const scope: LibraryScope = { ownerId: 'test-owner' }

function createFakeRepository() {
  const storylines = new Map<string, Awaited<ReturnType<GameLibraryRepository['findStoryline']>>>()
  const readiness = new Map<string, StorylineReadinessVerdict>()
  const games = new Map<string, PersistedGame>()
  let importCalls = 0
  const now = '2026-08-20T12:00:00.000Z'

  const repository: GameLibraryRepository = {
    async listStorylines() {
      return [...storylines.entries()]
        .filter(([fingerprint]) => readiness.has(fingerprint))
        .map(([, value]) => value)
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
    },
    async findStoryline(_scope, fingerprint) {
      return storylines.get(fingerprint)
    },
    async findStorylineReadiness(_scope, fingerprint) {
      return readiness.get(fingerprint)
    },
    async saveStoryline(_scope, storyline) {
      storylines.set(storyline.fingerprint, storyline)
    },
    async certifyStoryline(_scope, storyline, passport) {
      storylines.set(storyline.fingerprint, storyline)
      readiness.set(storyline.fingerprint, passport)
    },
    async listGames() {
      return [...games.values()]
    },
    async findGame(_scope, id) {
      return games.get(id)
    },
    async createGame(_scope, game: NewPersistedGame) {
      const persisted = { ...game, version: 1, createdAt: now, updatedAt: now }
      games.set(game.id, persisted)
      return persisted
    },
    async updateGame(_scope, id, expectedVersion, state) {
      const current = games.get(id)
      if (!current || current.version !== expectedVersion) return undefined
      const persisted = { ...current, state, version: current.version + 1 }
      games.set(id, persisted)
      return persisted
    },
    async deleteGame(_scope, id, expectedVersion) {
      const current = games.get(id)
      if (!current || current.version !== expectedVersion) return false
      return games.delete(id)
    },
    async importLibrary(_scope, library: LibraryImport) {
      importCalls += 1
      for (const storyline of library.storylines) storylines.set(storyline.fingerprint, storyline)
      for (const game of library.games) {
        const current = games.get(game.id)
        games.set(game.id, {
          ...game,
          version: current ? current.version + 1 : 1,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        })
      }
      return { storylinesImported: library.storylines.length, gamesImported: library.games.length }
    },
  }
  return { repository, storylines, readiness, games, getImportCalls: () => importCalls }
}

function passingReview(fingerprint: string): StoryLogicReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: fingerprint,
    verdict: 'pass',
    summary: 'Every required logic and endgame check passed.',
    checks: logicCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function readyRoleReport(storyline: ReturnType<typeof createDemoStoryline>, roleIndex: number): RoleRehearsalReport {
  const role = storyline.story.characters[roleIndex]
  return {
    schemaVersion: 1,
    definitionFingerprint: storyline.fingerprint,
    participantRef: `player-${roleIndex + 1}`,
    status: 'ready',
    summary: 'I can enter free play with useful facts and feasible goals.',
    actionableFacts: [{ factId: role.secrets[0]?.id ?? storyline.story.publicEvidence[0].id, canShare: true, intendedUse: 'Trade for corroboration.' }],
    objectiveAssessments: role.objectives.map(objective => ({ objectiveId: objective.id, feasibility: 'feasible', route: 'Use voluntary conversation.', blockers: [] })),
    investigationMoves: ['Compare accounts.'],
    questionsToPursue: ['Who can corroborate this?'],
    deductionRisks: [],
  }
}

function readyHostReport(storyline: ReturnType<typeof createDemoStoryline>): HostRehearsalReport {
  const feasible = { feasibility: 'feasible' as const, execution: 'Follow the authored host instruction.', blockers: [] }
  return {
    schemaVersion: 1,
    definitionFingerprint: storyline.fingerprint,
    status: 'ready',
    summary: 'Setup, opening, runtime, and reveal are executable as authored.',
    setupAssessments: storyline.setupRequirements.map(requirement => ({ requirementId: requirement.id, ...feasible })),
    openingAssessments: storyline.story.openingSteps.map(step => ({ stepId: step.id, ...feasible })),
    runtimeAssessment: feasible,
    revealAssessment: feasible,
    repairRisks: [],
  }
}

function passingJudge(storyline: ReturnType<typeof createDemoStoryline>): RehearsalJudgeReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: storyline.fingerprint,
    verdict: 'pass',
    summary: 'The isolated reports and authored truth support a complete game.',
    checks: rehearsalJudgeCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} passes.`, relatedIds: [] })),
    findings: [],
  }
}

function rehearsalOptions() {
  return {
    roleModel: 'role/test-model',
    hostModel: 'host/test-model',
    judgeModel: 'judge/test-model',
    run: (storyline: ReturnType<typeof createDemoStoryline>) => rehearseStoryline(storyline, {
      roleModel: 'role/test-model',
      hostModel: 'host/test-model',
      judgeModel: 'judge/test-model',
      rehearseRole: async (candidate, roleIndex) => readyRoleReport(candidate, roleIndex),
      rehearseHost: async candidate => readyHostReport(candidate),
      judge: async candidate => passingJudge(candidate),
    }),
  }
}

async function certify(
  fake: ReturnType<typeof createFakeRepository>,
  storyline: ReturnType<typeof createDemoStoryline>,
) {
  const { verdict } = await evaluateStorylineReadiness(storyline, {
    model: 'independent/test-reviewer',
    review: async () => passingReview(storyline.fingerprint),
    rehearsal: rehearsalOptions(),
    now: () => new Date('2026-08-20T12:00:00.000Z'),
  })
  await certifyValidatedStoryline(fake.repository, scope, storyline, verdict)
}

describe('persisted game library', () => {
  it('lists only storylines with a durable playability passport', async () => {
    const fake = createFakeRepository()
    const quarantined = createDemoStoryline('quarantined')
    const certified = createDemoStoryline('certified')
    await fake.repository.saveStoryline(scope, quarantined)
    await certify(fake, certified)

    const available = await listAvailableStorylines(fake.repository, scope)

    expect(available.map(storyline => storyline.fingerprint)).toEqual([certified.fingerprint])
  })

  it('creates a game only from a certified storyline and updates it optimistically', async () => {
    const fake = createFakeRepository()
    const storyline = createDemoStoryline('certified-game')
    await certify(fake, storyline)
    const created = await createPersistedGame(fake.repository, scope, {
      storylineFingerprint: storyline.fingerprint,
      session: {
        host: { displayName: 'Camille' },
        participants: [{ displayName: 'Alex' }],
        allowAiFallback: true,
      },
      capabilities: { aiControllers: true },
    })

    expect(created?.version).toBe(1)
    expect(created?.state.phase).toBe('enrolling')
    expect(fake.readiness.get(storyline.fingerprint)?.status).toBe('playable')

    const result = await executePersistedGameCommand(fake.repository, scope, {
      game: created!,
      expectedVersion: 1,
      command: { name: 'replace_enrolment', payload: { setup: created!.state.phase === 'enrolling' ? created!.state.setup : undefined! } },
    })
    expect(result.game?.version).toBe(2)

    const stale = await executePersistedGameCommand(fake.repository, scope, {
      game: created!,
      expectedVersion: 1,
      command: { name: 'replace_enrolment', payload: { setup: created!.state.phase === 'enrolling' ? created!.state.setup : undefined! } },
    })
    expect(stale.game).toBeUndefined()
  })

  it('rejects a structurally valid but uncertified storyline', async () => {
    const fake = createFakeRepository()
    const storyline = createDemoStoryline('not-certified')
    await fake.repository.saveStoryline(scope, storyline)

    await expect(createPersistedGame(fake.repository, scope, {
      storylineFingerprint: storyline.fingerprint,
      session: { host: { displayName: 'Camille' }, participants: [] },
    })).rejects.toBeInstanceOf(StorylineNotPlayableError)
  })

  it('rejects a forged passport instead of persisting it', async () => {
    const fake = createFakeRepository()
    const storyline = createDemoStoryline('forged-passport')
    const { verdict } = await evaluateStorylineReadiness(storyline, {
      model: 'independent/test-reviewer',
      review: async () => passingReview(storyline.fingerprint),
      rehearsal: rehearsalOptions(),
    })
    const forged = { ...verdict, definitionFingerprint: 'different-fingerprint' }

    await expect(certifyValidatedStoryline(fake.repository, scope, storyline, forged))
      .rejects.toBeInstanceOf(StorylineNotPlayableError)
    expect(fake.storylines.size).toBe(0)
    expect(fake.readiness.size).toBe(0)
  })

  it('deletes a game when the canonical reset command returns idle', async () => {
    const fake = createFakeRepository()
    const storyline = createDemoStoryline('reset-game')
    const runtime = createGameRuntime(storyline)
    const result = runtime.createSession(
      { host: { displayName: 'Host' }, participants: [] },
      { capabilities: { aiControllers: false }, createId: () => 'friendly-local-id' },
    )
    expect(result.state.phase).toBe('enrolling')
    await certify(fake, storyline)
    const game = await fake.repository.createGame(scope, {
      id: 'friendly-local-id',
      storylineFingerprint: storyline.fingerprint,
      state: result.state as Extract<typeof result.state, { phase: 'enrolling' }>,
    })

    const reset = await executePersistedGameCommand(fake.repository, scope, {
      game,
      expectedVersion: 1,
      command: { name: 'reset', payload: { confirmed: true } },
    })

    expect(reset.deleted).toBe(true)
    expect(await fake.repository.findGame(scope, game.id)).toBeUndefined()
  })

  it('validates the complete local-library import before its one repository write', async () => {
    const fake = createFakeRepository()
    const storyline = createDemoStoryline('legacy-import')
    const runtime = createGameRuntime(storyline)
    const created = runtime.createSession(
      { host: { displayName: 'Host' }, participants: [] },
      { capabilities: { aiControllers: false }, createId: () => 'legacy-browser-game' },
    )

    const imported = await importPersistedLibrary(fake.repository, scope, {
      storylines: [storyline, storyline],
      sessions: [{ storyline, state: created.state }],
    })
    expect(imported).toEqual({ storylinesImported: 1, gamesImported: 0 })
    expect(fake.getImportCalls()).toBe(1)

    const tampered = { ...storyline, title: 'Changed without a new fingerprint' }
    await expect(importPersistedLibrary(fake.repository, scope, {
      storylines: [tampered],
      sessions: [],
    })).rejects.toThrow(/fingerprint/i)
    expect(fake.getImportCalls()).toBe(1)
  })
})
