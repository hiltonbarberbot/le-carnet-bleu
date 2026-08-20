import type { StorylineDefinition } from '../../definition/contract'
import {
  formatStorylineRehearsalFailure,
  validateHostRehearsalReport,
  rehearsalJudgePassed,
  validateRehearsalJudgeReview,
  validateRoleRehearsalReport,
  validateStorylineRehearsalReport,
  type RehearsalJudgeReview,
  type HostRehearsalReport,
  type RoleRehearsalReport,
  type StorylineRehearsalReport,
} from './contract'
import {
  defaultRehearsalJudgeModel,
  defaultHostRehearsalModel,
  defaultRoleRehearsalModel,
  judgeRehearsalWithGateway,
  rehearseHostWithGateway,
  rehearseRoleWithGateway,
} from './gateway'
import {
  defaultTableRehearsalModel,
  rehearseRoundTableWithGateway,
  tableRehearsalBlockers,
  tableRehearsalPassed,
  type TableRehearsalReport,
} from './table'

export type RoleRehearsalRunner = (
  definition: StorylineDefinition,
  roleIndex: number,
) => Promise<RoleRehearsalReport>

export type RehearsalJudgeRunner = (
  definition: StorylineDefinition,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
  tableReport: TableRehearsalReport,
) => Promise<RehearsalJudgeReview>

export type HostRehearsalRunner = (
  definition: StorylineDefinition,
) => Promise<HostRehearsalReport>

export type TableRehearsalRunner = (
  definition: StorylineDefinition,
) => Promise<TableRehearsalReport>

export type StorylineRehearsalOptions = {
  roleModel?: string
  hostModel?: string
  judgeModel?: string
  tableModel?: string
  rehearseRole?: RoleRehearsalRunner
  rehearseHost?: HostRehearsalRunner
  rehearseTable?: TableRehearsalRunner
  judge?: RehearsalJudgeRunner
}

function collectBlockingReasons(
  definition: StorylineDefinition,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
  judgeReview: RehearsalJudgeReview,
  tableReport: TableRehearsalReport,
) {
  const roleReasons = roleReports.flatMap(report => {
    if (report.status === 'ready') return []
    const objectives = report.objectiveAssessments
      .filter(objective => objective.feasibility !== 'feasible')
      .flatMap(objective => objective.blockers.length ? objective.blockers : [objective.route])
    return [`${report.participantRef} rehearsal was ${report.status}.`, ...objectives]
  })
  const hostReasons = hostReport.status === 'ready'
    ? []
    : [
      `Host rehearsal was ${hostReport.status}.`,
      ...hostReport.setupAssessments.flatMap(assessment => assessment.feasibility === 'feasible' ? [] : assessment.blockers.length ? assessment.blockers : [assessment.execution]),
      ...hostReport.openingAssessments.flatMap(assessment => assessment.feasibility === 'feasible' ? [] : assessment.blockers.length ? assessment.blockers : [assessment.execution]),
      ...(hostReport.runtimeAssessment.feasibility === 'feasible' ? [] : hostReport.runtimeAssessment.blockers.length ? hostReport.runtimeAssessment.blockers : [hostReport.runtimeAssessment.execution]),
      ...(hostReport.revealAssessment.feasibility === 'feasible' ? [] : hostReport.revealAssessment.blockers.length ? hostReport.revealAssessment.blockers : [hostReport.revealAssessment.execution]),
      ...hostReport.repairRisks,
    ]
  const judgeReasons = [
    ...judgeReview.checks.filter(check => check.verdict === 'fail').map(check => `${check.id}: ${check.explanation}`),
    ...judgeReview.findings.filter(finding => finding.severity === 'blocking').map(finding => `${finding.code}: ${finding.message}`),
  ]
  return [...new Set([...roleReasons, ...hostReasons, ...tableRehearsalBlockers(definition, tableReport), ...judgeReasons])]
}

/**
 * Runs one isolated LLM playtest per suspect, then a separate spoiler-aware
 * judge. Role calls are concurrent and never receive the solution or another
 * suspect's private dossier.
 */
export async function rehearseStoryline(
  definition: StorylineDefinition,
  options: StorylineRehearsalOptions = {},
): Promise<StorylineRehearsalReport> {
  const roleModel = options.roleModel ?? process.env.AI_GATEWAY_REHEARSAL_ROLE_MODEL ?? defaultRoleRehearsalModel
  const hostModel = options.hostModel ?? process.env.AI_GATEWAY_REHEARSAL_HOST_MODEL ?? defaultHostRehearsalModel
  const judgeModel = options.judgeModel ?? process.env.AI_GATEWAY_REHEARSAL_JUDGE_MODEL ?? defaultRehearsalJudgeModel
  const tableModel = options.tableModel ?? process.env.AI_GATEWAY_REHEARSAL_TABLE_MODEL ?? defaultTableRehearsalModel
  const rehearseRole = options.rehearseRole
    ?? ((candidate, roleIndex) => rehearseRoleWithGateway(candidate, roleIndex, { model: roleModel }))
  const rehearseHost = options.rehearseHost
    ?? (candidate => rehearseHostWithGateway(candidate, { model: hostModel }))
  const rehearseTable = options.rehearseTable
    ?? (candidate => rehearseRoundTableWithGateway(candidate, { model: tableModel }))
  const judge = options.judge
    ?? ((candidate, reports, hostReport, tableReport) => judgeRehearsalWithGateway(candidate, reports, hostReport, tableReport, { model: judgeModel }))

  const [hostReport, roleReports, tableReport] = await Promise.all([
    rehearseHost(definition).then(report => {
      const errors = validateHostRehearsalReport(definition, report)
      if (errors.length) throw new Error(`Invalid isolated-host rehearsal:\n${errors.join('\n')}`)
      return report
    }),
    Promise.all(definition.story.characters.map(async (_, roleIndex) => {
      const report = await rehearseRole(definition, roleIndex)
      const errors = validateRoleRehearsalReport(definition, roleIndex, report)
      if (errors.length) throw new Error(`Invalid isolated-player rehearsal:\n${errors.join('\n')}`)
      return report
    })),
    rehearseTable(definition),
  ])

  const judgeReview = await judge(definition, roleReports, hostReport, tableReport)
  const judgeErrors = validateRehearsalJudgeReview(definition, judgeReview)
  if (judgeErrors.length) throw new Error(`Invalid rehearsal judge review:\n${judgeErrors.join('\n')}`)
  const tableBlockers = tableRehearsalBlockers(definition, tableReport)
  const blockingReasons = collectBlockingReasons(definition, roleReports, hostReport, judgeReview, tableReport)
  const verdict = roleReports.every(report => report.status === 'ready')
    && hostReport.status === 'ready'
    && tableRehearsalPassed(tableReport)
    && tableBlockers.length === 0
    && rehearsalJudgePassed(judgeReview)
    && blockingReasons.length === 0
    ? 'pass'
    : 'fail'
  const report: StorylineRehearsalReport = {
    schemaVersion: 1,
    definitionFingerprint: definition.fingerprint,
    roleModel,
    hostModel,
    judgeModel,
    tableModel,
    verdict,
    tableReport,
    roleReports,
    hostReport,
    judgeReview,
    blockingReasons,
  }
  const errors = validateStorylineRehearsalReport(definition, report)
  if (errors.length) throw new Error(`Invalid storyline rehearsal report:\n${errors.join('\n')}`)
  return report
}

export { formatStorylineRehearsalFailure }
