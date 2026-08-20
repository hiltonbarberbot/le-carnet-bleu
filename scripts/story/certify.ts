import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createStorylineDefinition } from '../../src/game/definition/create.js'
import type { StorylineDefinitionInput } from '../../src/game/definition/contract.js'
import {
  defaultLogicReviewModel,
  reviewStorylineLogic,
} from '../../src/game/story/review/gateway.js'
import {
  evaluateStorylineReadiness,
  storylineReadinessPassed,
} from '../../src/game/story/review/readiness.js'
import {
  defaultHostRehearsalModel,
  defaultRehearsalJudgeModel,
  defaultRoleRehearsalModel,
  rehearseStoryline,
} from '../../src/game/story/rehearsal/index.js'

const writePassports = process.argv.includes('--write')
const requestedPaths = process.argv.slice(2).filter(argument => !argument.startsWith('--'))
const reviewModel = process.env.AI_GATEWAY_REVIEW_MODEL ?? defaultLogicReviewModel
const roleModel = process.env.AI_GATEWAY_REHEARSAL_ROLE_MODEL ?? defaultRoleRehearsalModel
const hostModel = process.env.AI_GATEWAY_REHEARSAL_HOST_MODEL ?? defaultHostRehearsalModel
const judgeModel = process.env.AI_GATEWAY_REHEARSAL_JUDGE_MODEL ?? defaultRehearsalJudgeModel

async function defaultPaths() {
  const root = resolve('story/runs')
  return (await readdir(root)).map(name => resolve(root, name, 'story.json')).sort()
}

async function certify(path: string) {
  const definition = createStorylineDefinition(
    JSON.parse(await readFile(path, 'utf8')) as StorylineDefinitionInput,
  )
  const evaluation = await evaluateStorylineReadiness(definition, {
    model: reviewModel,
    review: candidate => reviewStorylineLogic(candidate, { model: reviewModel }),
    rehearsal: {
      roleModel,
      hostModel,
      judgeModel,
      run: candidate => rehearseStoryline(candidate, { roleModel, hostModel, judgeModel }),
    },
  })

  const result = {
    path,
    title: definition.story.title,
    fingerprint: definition.fingerprint,
    status: evaluation.verdict.status,
    blockingReasons: evaluation.verdict.blockingReasons,
    reviewerError: evaluation.reviewerError instanceof Error
      ? evaluation.reviewerError.message
      : evaluation.reviewerError ? String(evaluation.reviewerError) : undefined,
    rehearsalError: evaluation.rehearsalError instanceof Error
      ? evaluation.rehearsalError.message
      : evaluation.rehearsalError ? String(evaluation.rehearsalError) : undefined,
  }
  if (!storylineReadinessPassed(evaluation.verdict)) return result

  if (writePassports) {
    await writeFile(
      resolve(dirname(path), 'passport.json'),
      `${JSON.stringify(evaluation.verdict, null, 2)}\n`,
    )
  }
  return result
}

const paths = requestedPaths.length ? requestedPaths.map(path => resolve(path)) : await defaultPaths()
let failed = false
for (const path of paths) {
  try {
    const result = await certify(path)
    console.log(JSON.stringify(result))
    if (result.status !== 'playable') failed = true
  } catch (error) {
    failed = true
    console.error(JSON.stringify({
      path,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}
if (failed) process.exitCode = 1
