import type { StorylineDefinition } from '../../definition/contract'
import { gameCommandDescriptors } from '../../application/commands'
import type { HostRehearsalReport, RoleRehearsalReport } from './contract'

export function createRoleRehearsalPacket(definition: StorylineDefinition, roleIndex: number) {
  const role = definition.story.characters[roleIndex]
  if (!role) throw new Error(`No suspect exists for rehearsal seat ${roleIndex + 1}.`)
  const participantRef = `player-${roleIndex + 1}`
  return {
    definitionFingerprint: definition.fingerprint,
    participantRef,
    publicContext: {
      title: definition.title,
      premise: definition.story.premise,
      host: definition.story.host,
      cast: definition.story.characters.map(character => ({
        id: character.id,
        name: character.name,
        title: character.title,
        costume: character.costume,
        publicFace: character.publicFace,
      })),
      publicEvidence: definition.story.publicEvidence,
      opening: definition.story.openingSteps.map(step => ({
        title: step.title,
        trigger: step.trigger,
        yourInstructions: step.instructions
          .filter(instruction => instruction.recipientRoleId === role.id)
          .map(instruction => instruction.text),
      })),
      clueSources: definition.clueDecks.map(deck => ({ label: deck.label, clueCount: deck.clues.length })),
    },
    yourDossier: {
      name: role.name,
      title: role.title,
      publicFace: role.publicFace,
      invitationPretext: role.invitationPretext,
      invitationPromise: role.invitationPromise,
      privateIdentity: role.privateIdentity,
      privateObjective: role.privateObjective,
      privateSecret: role.privateSecret,
      traits: role.traits,
      objectives: role.objectives,
      relationships: role.relationships,
      secrets: role.secrets,
    },
  }
}

export function createRoleRehearsalPrompt(definition: StorylineDefinition, roleIndex: number) {
  const packet = createRoleRehearsalPacket(definition, roleIndex)
  return `Privately simulate playing one suspect in a live social mystery. You have only the public opening material and your own dossier below. You do not have the solution, culprit marker, other dossiers, or host-only instructions. Never assume hidden facts.

Test whether you can enter free play with useful things to say, concrete people to question, and a plausible route to every scored objective. A route must work through voluntary conversation, bargaining, the listed public evidence, and optional clue purchases. Do not assume another player confesses, cooperates automatically, invents a fact, performs an unauthored future event, or reveals information they do not possess.

Use only fact IDs that appear in your secrets or the public evidence. Assess every objective exactly once. Mark status blocked if any objective is blocked; mark inconclusive if no objective is blocked but one remains uncertain; otherwise mark ready. In all prose, call yourself "I" and do not state your own name or title.

Private player packet:
${JSON.stringify(packet)}`
}

export function createHostRehearsalPacket(definition: StorylineDefinition) {
  return {
    definitionFingerprint: definition.fingerprint,
    setting: definition.setting,
    setupRequirements: definition.setupRequirements,
    publicCast: definition.story.characters.map(character => ({
      id: character.id,
      name: character.name,
      title: character.title,
      costume: character.costume,
      publicFace: character.publicFace,
    })),
    opening: definition.story.openingSteps.map(step => ({
      id: step.id,
      title: step.title,
      trigger: step.trigger,
      hostInstructions: step.instructions
        .filter(instruction => instruction.recipientRoleId === definition.story.host.id)
        .map(instruction => instruction.text),
      execution: step.execution,
      setupRequirementIds: step.setupRequirementIds,
      settingRefs: step.settingRefs,
      propIds: step.propIds,
    })),
    clueDecks: definition.clueDecks,
    runtimeOperations: gameCommandDescriptors,
    authoredTruth: {
      culpritRoleId: definition.story.culpritRoleId,
      caseTheory: definition.story.caseTheory,
      solutionSteps: definition.story.solutionSteps,
      solutionSummary: definition.story.solutionSummary,
    },
  }
}

export function createHostRehearsalPrompt(definition: StorylineDefinition) {
  return `Privately simulate hosting this complete live social mystery. You receive the verified setting, physical setup, host-only opening cues, runtime operations, clue decks, and full solution. You do not receive any player's private dossier prose.

Prove that the exact authored materials let a host prepare the room, execute every opening step safely and in order, operate continuous investigation and an accusation or timeout, deliver the complete reveal, score the game, and finish it without inventing dialogue, evidence, props, transitions, or causal explanations. Assess every setup requirement and opening step exactly once. Judge props by the combined preparation burden, not their count: several ready-to-hand items can be simpler than one elaborate dependency. Record a repair risk for unavailable or unsafe props, substantial sourcing, fabrication, assembly, technical preparation, concealment mechanisms, synchronized swaps, precise timing, rehearsal, or difficult reset. Essential physical evidence must have an authored dossier, public-fact, or app fallback.

Mark status blocked when any execution is impossible or needs improvisational repair. Mark status inconclusive if none is known impossible but any execution remains uncertain. Mark ready only when every assessment is feasible and repairRisks is empty.

Private host packet:
${JSON.stringify(createHostRehearsalPacket(definition))}`
}

function replaceIdentity(text: string, identity: string[]) {
  return identity.reduce((result, value) => value.trim()
    ? result.replaceAll(value, '[this player]')
    : result, text)
}

export function anonymizeRoleReports(
  definition: StorylineDefinition,
  reports: RoleRehearsalReport[],
) {
  return reports.map((report, index) => {
    const role = definition.story.characters[index]
    const redact = (text: string) => replaceIdentity(text, [role.id, role.name, role.title])
    return {
      participant: `Player ${String.fromCharCode(65 + (reports.length - index - 1))}`,
      status: report.status,
      summary: redact(report.summary),
      actionableFacts: report.actionableFacts.map(fact => ({
        canShare: fact.canShare,
        intendedUse: redact(fact.intendedUse),
      })),
      objectiveAssessments: report.objectiveAssessments.map(objective => ({
        feasibility: objective.feasibility,
        route: redact(objective.route),
        blockers: objective.blockers.map(redact),
      })),
      investigationMoves: report.investigationMoves.map(redact),
      questionsToPursue: report.questionsToPursue.map(redact),
      deductionRisks: report.deductionRisks.map(redact),
    }
  }).reverse()
}

export function createRehearsalJudgePrompt(
  definition: StorylineDefinition,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
) {
  return `Judge a complete live-mystery rehearsal. The player reports were produced independently from isolated dossiers. They have been reordered and stripped of explicit role, fact, and objective identifiers. You may inspect the authored truth, but do not assume a player knows anything absent from their own report or an authored information route.

Fail unless all of these are true:
- players can identify the culprit from authored evidence, without confession, lucky guessing, or purchasing every clue;
- every scored objective has a voluntary, authored route during free play;
- the combined information flow has no single uncooperative-player dead end for a required deduction or objective;
- the ordered solution, accusation, and reveal consistently explain motive, concrete means, opportunity, fatal act, and any cover-up;
- purchasable clues accelerate or corroborate the deduction but are not collectively mandatory;
- every isolated player is ready to begin with actionable material.

Return each required check exactly once. Any failed check requires at least one blocking finding and a fail verdict. An inconclusive player report is blocking because this certification is fail-closed.

Definition fingerprint: ${definition.fingerprint}

Anonymized isolated-player reports:
${JSON.stringify(anonymizeRoleReports(definition, roleReports))}

Isolated host execution report:
${JSON.stringify(hostReport)}

Authored truth and runtime material:
${JSON.stringify({
    story: definition.story,
    clueDecks: definition.clueDecks,
    acts: definition.acts,
    setupRequirements: definition.setupRequirements,
  })}`
}
