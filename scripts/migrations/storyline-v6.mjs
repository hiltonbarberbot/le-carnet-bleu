import { readFile, readdir, writeFile } from 'node:fs/promises'

const runsRoot = new URL('../../story/runs/', import.meta.url)

function addressedInstructions(story, step) {
  const source = step.instruction?.trim()
  if (!source) throw new Error(`${story.id}/${step.id} has no legacy instruction to migrate.`)

  const addressedCharacter = story.characters.find(character => source.includes(`${character.name}:`))
  if (!addressedCharacter) return [{ recipientRoleId: story.host.id, text: source }]

  const marker = `${addressedCharacter.name}:`
  const markerIndex = source.indexOf(marker)
  const hostText = source.slice(0, markerIndex).trim()
  const playerText = source.slice(markerIndex + marker.length).trim()
  if (!hostText || !playerText) throw new Error(`${story.id}/${step.id} cannot be split into host and player instructions.`)

  return [
    { recipientRoleId: story.host.id, text: hostText },
    { recipientRoleId: addressedCharacter.id, text: playerText },
  ]
}

function storylineV6(input) {
  const story = structuredClone(input.story)
  story.openingSteps = story.openingSteps.map(step => {
    const migrated = { ...step, instructions: addressedInstructions(story, step) }
    delete migrated.instruction
    return migrated
  })
  return { ...input, schemaVersion: 6, story }
}

for (const directory of await readdir(runsRoot)) {
  const storyPath = new URL(`${directory}/story.json`, runsRoot)
  const input = JSON.parse(await readFile(storyPath, 'utf8'))
  if (input.schemaVersion === 5) await writeFile(storyPath, `${JSON.stringify(storylineV6(input), null, 2)}\n`)
}

console.log('Migrated story runs to addressed opening instructions.')
