import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createStorylineDefinition } from '../src/game/definition/create.js'
import type { StorylineDefinitionInput } from '../src/game/definition/contract.js'
import { formatLogicReviewFailure, logicReviewPassed } from '../src/game/story/review/contract.js'
import { reviewStorylineLogic } from '../src/game/story/review/gateway.js'
import { auditStorylineLogicStatically } from '../src/game/story/review/static.js'

type ReviewResult = {
  path: string
  verdict: 'pass' | 'fail' | 'error'
  stage: 'static' | 'llm'
  summary: string
}

function argumentsFrom(argv: string[]) {
  const json = argv.includes('--json')
  const modelFlag = argv.findIndex(value => value === '--model')
  const model = modelFlag >= 0 ? argv[modelFlag + 1] : undefined
  const paths = argv.filter((value, index) => !value.startsWith('--') && index !== modelFlag + 1)
  return { json, model, paths }
}

async function defaultPaths() {
  const root = resolve('story/runs')
  return (await readdir(root)).map(name => resolve(root, name, 'story.json')).sort()
}

async function reviewPath(path: string, model?: string): Promise<ReviewResult> {
  try {
    const source = JSON.parse(await readFile(path, 'utf8')) as StorylineDefinitionInput
    const definition = createStorylineDefinition(source)
    const staticErrors = auditStorylineLogicStatically(definition)
    if (staticErrors.length) return { path, verdict: 'fail', stage: 'static', summary: staticErrors.join('\n') }
    const review = await reviewStorylineLogic(definition, { model })
    return logicReviewPassed(review)
      ? { path, verdict: 'pass', stage: 'llm', summary: review.summary }
      : { path, verdict: 'fail', stage: 'llm', summary: formatLogicReviewFailure(review) }
  } catch (error) {
    return { path, verdict: 'error', stage: 'static', summary: error instanceof Error ? error.message : String(error) }
  }
}

const options = argumentsFrom(process.argv.slice(2))
const paths = options.paths.length ? options.paths.map(path => resolve(path)) : await defaultPaths()
const results: ReviewResult[] = []
for (const path of paths) results.push(await reviewPath(path, options.model))

if (options.json) console.log(JSON.stringify(results, null, 2))
else {
  for (const result of results) {
    console.log(`${result.verdict.toUpperCase()} ${result.path} (${result.stage})`)
    console.log(result.summary)
  }
}

if (results.some(result => result.verdict !== 'pass')) process.exitCode = 1
