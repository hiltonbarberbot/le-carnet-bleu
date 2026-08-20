import { describe, expect, it, vi } from 'vitest'
import { createDemoGame } from '../../demo'
import {
  rehearsalJudgeCheckIds,
  validateStorylineRehearsalReport,
  type HostRehearsalReport,
  type RehearsalJudgeReview,
  type RoleRehearsalReport,
} from './contract'
import {
  createHostRehearsalPacket,
  createHostRehearsalPrompt,
  createRehearsalJudgePrompt,
  createRoleRehearsalPacket,
  createRoleRehearsalPrompt,
} from './packets'
import { rehearseStoryline } from './rehearse'

function readyRoleReport(definition: ReturnType<typeof createDemoGame>, roleIndex: number): RoleRehearsalReport {
  const role = definition.story.characters[roleIndex]
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    participantRef: `player-${roleIndex + 1}`,
    status: 'ready',
    summary: 'I have useful facts, questions, and achievable social goals.',
    actionableFacts: [{
      factId: role.secrets[0]?.id ?? definition.story.publicEvidence[0].id,
      canShare: true,
      intendedUse: 'I can trade this fact for another account of the timeline.',
    }],
    objectiveAssessments: role.objectives.map(objective => ({
      objectiveId: objective.id,
      feasibility: 'feasible',
      route: 'I can pursue this through a voluntary conversation during free play.',
      blockers: [],
    })),
    investigationMoves: ['Ask another suspect to compare accounts.'],
    questionsToPursue: ['Who can independently corroborate the timeline?'],
    deductionRisks: [],
  }
}

function readyHostReport(definition: ReturnType<typeof createDemoGame>): HostRehearsalReport {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    status: 'ready',
    summary: 'The room, opening, runtime, and reveal are executable exactly as authored.',
    setupAssessments: definition.setupRequirements.map(requirement => ({
      requirementId: requirement.id,
      feasibility: 'feasible',
      execution: 'Prepare the verified setting resource before enrollment is locked.',
      blockers: [],
    })),
    openingAssessments: definition.story.openingSteps.map(step => ({
      stepId: step.id,
      feasibility: 'feasible',
      execution: 'Follow the host cue and mark this ordered step complete.',
      blockers: [],
    })),
    runtimeAssessment: { feasibility: 'feasible', execution: 'Use the authored commands through accusation or timeout and scoring.', blockers: [] },
    revealAssessment: { feasibility: 'feasible', execution: 'Read the ordered causal solution and complete the game.', blockers: [] },
    repairRisks: [],
  }
}

function passingJudge(definition: ReturnType<typeof createDemoGame>): RehearsalJudgeReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    verdict: 'pass',
    summary: 'The isolated players can circulate enough information to reach the authored reveal.',
    checks: rehearsalJudgeCheckIds.map(id => ({
      id,
      verdict: 'pass',
      explanation: `${id} has a complete authored route.`,
      relatedIds: [],
    })),
    findings: [],
  }
}

describe('spoiler-isolated storyline rehearsal', () => {
  it('gives a role only public opening material and its own dossier', () => {
    const definition = createDemoGame('isolated-packet')
    const roleIndex = definition.story.characters.findIndex(role => role.id !== definition.story.culpritRoleId)
    const role = definition.story.characters[roleIndex]
    const packet = createRoleRehearsalPacket(definition, roleIndex)
    const serialized = JSON.stringify(packet)

    expect(serialized).toContain(role.privateSecret)
    expect(serialized).not.toContain('culpritRoleId')
    expect(serialized).not.toContain('solutionSteps')
    expect(serialized).not.toContain('solutionSummary')
    for (const other of definition.story.characters.filter(candidate => candidate.id !== role.id)) {
      expect(serialized).not.toContain(other.privateSecret)
    }
    for (const step of definition.story.openingSteps) {
      for (const instruction of step.instructions.filter(candidate => candidate.recipientRoleId !== role.id)) {
        expect(serialized).not.toContain(instruction.text)
      }
    }
    expect(createRoleRehearsalPrompt(definition, roleIndex)).toContain('You do not have the solution')
  })

  it('gives the host executable truth without player-only dossier prose', () => {
    const definition = createDemoGame('isolated-host-packet')
    const serialized = JSON.stringify(createHostRehearsalPacket(definition))

    expect(serialized).toContain(definition.story.solutionSummary)
    expect(serialized).toContain('runtimeOperations')
    for (const role of definition.story.characters) {
      expect(serialized).not.toContain(role.privateIdentity)
      expect(serialized).not.toContain(role.privateSecret)
      for (const objective of role.objectives) expect(serialized).not.toContain(objective.text)
      for (const secret of role.secrets) expect(serialized).not.toContain(secret.text)
    }
    expect(createHostRehearsalPrompt(definition)).toContain('without inventing')
  })

  it('runs one independent call per suspect before one anonymized judge call', async () => {
    const definition = createDemoGame('five-player-rehearsal')
    const roleRunner = vi.fn(async (candidate, roleIndex: number) => readyRoleReport(candidate, roleIndex))
    const hostRunner = vi.fn(async candidate => readyHostReport(candidate))
    const judge = vi.fn(async (candidate, reports: RoleRehearsalReport[], hostReport: HostRehearsalReport) => {
      const prompt = createRehearsalJudgePrompt(candidate, reports, hostReport)
      expect(prompt).not.toContain('"participantRef"')
      expect(prompt).not.toContain('"factId"')
      expect(prompt).not.toContain('"objectiveId"')
      return passingJudge(candidate)
    })

    const report = await rehearseStoryline(definition, {
      roleModel: 'role/model',
      hostModel: 'host/model',
      judgeModel: 'judge/model',
      rehearseRole: roleRunner,
      rehearseHost: hostRunner,
      judge,
    })

    expect(roleRunner).toHaveBeenCalledTimes(definition.story.characters.length)
    expect(hostRunner).toHaveBeenCalledTimes(1)
    expect(judge).toHaveBeenCalledTimes(1)
    expect(report.verdict).toBe('pass')
    expect(validateStorylineRehearsalReport(definition, report)).toEqual([])
  })

  it('fails closed when an isolated player cannot complete an objective', async () => {
    const definition = createDemoGame('blocked-player')
    const report = await rehearseStoryline(definition, {
      roleModel: 'role/model',
      judgeModel: 'judge/model',
      rehearseRole: async (candidate, roleIndex) => {
        const roleReport = readyRoleReport(candidate, roleIndex)
        if (roleIndex === 2) {
          roleReport.status = 'blocked'
          roleReport.objectiveAssessments[0].feasibility = 'blocked'
          roleReport.objectiveAssessments[0].blockers = ['The only holder has no authored reason to disclose the required fact.']
        }
        return roleReport
      },
      rehearseHost: async candidate => readyHostReport(candidate),
      judge: async candidate => passingJudge(candidate),
    })

    expect(report.verdict).toBe('fail')
    expect(report.blockingReasons.join('\n')).toContain('only holder')
    expect(validateStorylineRehearsalReport(definition, report)).toEqual([])
  })

  it('rejects malformed role output before calling the judge', async () => {
    const definition = createDemoGame('malformed-player')
    const judge = vi.fn()

    await expect(rehearseStoryline(definition, {
      rehearseRole: async (candidate, roleIndex) => {
        const report = readyRoleReport(candidate, roleIndex)
        if (roleIndex === 0) report.definitionFingerprint = 'another-story'
        return report
      },
      rehearseHost: async candidate => readyHostReport(candidate),
      judge,
    })).rejects.toThrow('fingerprint does not match')
    expect(judge).not.toHaveBeenCalled()
  })

  it('keeps a blocking judge verdict in the durable report', async () => {
    const definition = createDemoGame('judge-rejection')
    const report = await rehearseStoryline(definition, {
      rehearseRole: async (candidate, roleIndex) => readyRoleReport(candidate, roleIndex),
      rehearseHost: async candidate => readyHostReport(candidate),
      judge: async candidate => {
        const review = passingJudge(candidate)
        review.verdict = 'fail'
        review.checks[0].verdict = 'fail'
        review.checks[0].explanation = 'The culprit can be selected only after buying every clue.'
        review.findings.push({
          severity: 'blocking',
          code: 'clue_dependency',
          message: 'All purchasable clues are mandatory.',
          relatedIds: [],
        })
        return review
      },
    })

    expect(report.verdict).toBe('fail')
    expect(report.blockingReasons.join('\n')).toContain('every clue')
  })

  it('treats an inconclusive host rehearsal as blocking', async () => {
    const definition = createDemoGame('host-repair-risk')
    const report = await rehearseStoryline(definition, {
      rehearseRole: async (candidate, roleIndex) => readyRoleReport(candidate, roleIndex),
      rehearseHost: async candidate => {
        const host = readyHostReport(candidate)
        host.status = 'inconclusive'
        host.revealAssessment.feasibility = 'uncertain'
        host.revealAssessment.blockers = ['The authored reveal does not explain how the fatal act occurred.']
        return host
      },
      judge: async candidate => passingJudge(candidate),
    })

    expect(report.verdict).toBe('fail')
    expect(report.blockingReasons.join('\n')).toContain('fatal act')
  })
})
