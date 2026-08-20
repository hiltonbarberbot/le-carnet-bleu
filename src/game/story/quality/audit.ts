import type { StorylineDefinition } from '../../definition/contract'
import { storyQualityBudgets as budget } from './budgets'

type NarrativeText = { label: string; text: string }
const wordPattern = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu

export function countNarrativeWords(text: string): number {
  return text.match(wordPattern)?.length ?? 0
}

function playerPacketTexts(character: StorylineDefinition['story']['characters'][number]): string[] {
  return [
    character.name,
    character.title,
    character.costume,
    character.publicFace,
    character.invitationPretext,
    character.invitationPromise,
    character.privateIdentity,
    character.privateSecret,
    ...character.traits,
    ...character.objectives.flatMap(objective => [objective.title, objective.text]),
    ...character.relationships.map(relationship => relationship.text),
    ...character.secrets.map(secret => secret.text),
  ]
}

function normalizedTokens(text: string): string[] {
  return (text.toLocaleLowerCase().match(wordPattern) ?? []).filter(token => token.length > 1)
}

function duplicateNarrativeFindings(texts: NarrativeText[]): string[] {
  const findings: string[] = []
  const fingerprints = new Map<string, string>()
  const tokenLists = texts.map(item => normalizedTokens(item.text))

  for (const [index, item] of texts.entries()) {
    const tokens = tokenLists[index]
    if (tokens.length < 6) continue
    const fingerprint = tokens.join(' ')
    const existing = fingerprints.get(fingerprint)
    if (existing) findings.push(`quality budget: ${item.label} duplicates ${existing}`)
    else fingerprints.set(fingerprint, item.label)
  }

  for (let leftIndex = 0; leftIndex < texts.length; leftIndex += 1) {
    const left = texts[leftIndex]
    const leftList = tokenLists[leftIndex]
    const leftTokens = new Set(leftList)
    if (leftTokens.size < 10) continue
    for (let rightIndex = leftIndex + 1; rightIndex < texts.length; rightIndex += 1) {
      const right = texts[rightIndex]
      const rightList = tokenLists[rightIndex]
      const rightTokens = new Set(rightList)
      if (rightTokens.size < 10 || leftList.join(' ') === rightList.join(' ')) continue
      const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length
      const union = new Set([...leftTokens, ...rightTokens]).size
      const sizeRatio = Math.min(leftTokens.size, rightTokens.size) / Math.max(leftTokens.size, rightTokens.size)
      if (sizeRatio >= 0.8 && intersection / union >= 0.86) findings.push(`quality budget: ${right.label} substantially repeats ${left.label}`)
    }
  }
  return findings
}

function checkWords(findings: string[], label: string, text: string, maximum: number) {
  const words = countNarrativeWords(text)
  if (words > maximum) findings.push(`quality budget: ${label} is ${words} words; maximum ${maximum}`)
}

/** Audit bounded cognitive and production load after structural validation. */
export function auditStorylineQuality(definition: StorylineDefinition): string[] {
  const findings: string[] = []
  const story = definition.story
  const duplicateCandidates: NarrativeText[] = []

  checkWords(findings, 'story premise', story.premise, budget.textWords.premise)
  checkWords(findings, 'solution summary', story.solutionSummary, budget.textWords.solutionSummary)

  for (const character of story.characters) {
    const packetWords = playerPacketTexts(character).reduce((total, text) => total + countNarrativeWords(text), 0)
    if (packetWords > budget.playerPacketWords) findings.push(`quality budget: character ${character.id} player packet is ${packetWords} words; maximum ${budget.playerPacketWords}`)
    if (character.secrets.length > budget.factsPerPlayer) findings.push(`quality budget: character ${character.id} has ${character.secrets.length} starting facts; maximum ${budget.factsPerPlayer}`)
    if (character.relationships.length > budget.relationshipsPerPlayer) findings.push(`quality budget: character ${character.id} has ${character.relationships.length} relationships; maximum ${budget.relationshipsPerPlayer}`)
    if (character.traits.length > budget.traitsPerPlayer) findings.push(`quality budget: character ${character.id} has ${character.traits.length} traits; maximum ${budget.traitsPerPlayer}`)
    if (character.objectives.length > budget.objectivesPerPlayer) findings.push(`quality budget: character ${character.id} has ${character.objectives.length} objectives; maximum ${budget.objectivesPerPlayer}`)

    checkWords(findings, `character ${character.id} public face`, character.publicFace, budget.textWords.publicFace)
    checkWords(findings, `character ${character.id} invitation pretext`, character.invitationPretext, budget.textWords.invitationPretext)
    checkWords(findings, `character ${character.id} invitation promise`, character.invitationPromise, budget.textWords.invitationPromise)
    checkWords(findings, `character ${character.id} private identity`, character.privateIdentity, budget.textWords.privateIdentity)
    if (character.privateObjective) {
      checkWords(findings, `character ${character.id} private objective`, character.privateObjective, budget.textWords.privateObjective)
    }
    checkWords(findings, `character ${character.id} private secret`, character.privateSecret, budget.textWords.privateSecret)
    duplicateCandidates.push({ label: `character ${character.id} private secret`, text: character.privateSecret })
    for (const [index, trait] of character.traits.entries()) checkWords(findings, `character ${character.id} trait ${index + 1}`, trait, budget.textWords.trait)
    for (const objective of character.objectives) {
      checkWords(findings, `objective ${objective.id} title`, objective.title, budget.textWords.objectiveTitle)
      checkWords(findings, `objective ${objective.id}`, objective.text, budget.textWords.objectiveText)
      duplicateCandidates.push({ label: `objective ${objective.id}`, text: objective.text })
    }
    for (const [index, relationship] of character.relationships.entries()) {
      const label = `character ${character.id} relationship ${index + 1}`
      checkWords(findings, label, relationship.text, budget.textWords.relationship)
      duplicateCandidates.push({ label, text: relationship.text })
    }
    for (const fact of character.secrets) {
      const label = `fact ${fact.id}`
      checkWords(findings, label, fact.text, budget.textWords.fact)
      duplicateCandidates.push({ label, text: fact.text })
    }
  }

  const totalFacts = story.characters.reduce((total, character) => total + character.secrets.length, 0) + story.publicEvidence.length
  if (totalFacts > budget.totalStartingFacts) findings.push(`quality budget: story has ${totalFacts} starting facts; maximum ${budget.totalStartingFacts}`)
  const totalRelationships = story.characters.reduce((total, character) => total + character.relationships.length, 0)
  if (totalRelationships > budget.totalRelationships) findings.push(`quality budget: story has ${totalRelationships} directed relationships; maximum ${budget.totalRelationships}`)

  for (const evidence of story.publicEvidence) {
    const label = `public evidence ${evidence.id}`
    checkWords(findings, label, evidence.text, budget.textWords.publicEvidence)
    duplicateCandidates.push({ label, text: evidence.text })
  }
  for (const step of story.solutionSteps) {
    const label = `solution step ${step.id}`
    checkWords(findings, label, step.truth, budget.textWords.solutionTruth)
    duplicateCandidates.push({ label, text: step.truth })
  }

  const openingStepCount = story.openingSteps.length
  if (openingStepCount < budget.openingSteps.minimum || openingStepCount > budget.openingSteps.maximum) findings.push(`quality budget: opening has ${openingStepCount} steps; requires ${budget.openingSteps.minimum} to ${budget.openingSteps.maximum}`)
  const openingTexts = story.openingSteps.flatMap(step => [step.title, step.trigger, ...step.instructions.map(instruction => instruction.text)])
  const openingWords = openingTexts.reduce((total, text) => total + countNarrativeWords(text), 0)
  if (openingWords > budget.openingWords) findings.push(`quality budget: opening is ${openingWords} words; maximum ${budget.openingWords}`)
  const openingInstructions = story.openingSteps.flatMap(step => step.instructions)
  if (openingInstructions.length > budget.openingInstructions) findings.push(`quality budget: opening has ${openingInstructions.length} instructions; maximum ${budget.openingInstructions}`)
  for (const character of story.characters) {
    const cueCount = openingInstructions.filter(instruction => instruction.recipientRoleId === character.id).length
    if (cueCount > budget.openingCuesPerPlayer) findings.push(`quality budget: character ${character.id} has ${cueCount} private opening cues; maximum ${budget.openingCuesPerPlayer}`)
  }
  for (const step of story.openingSteps) {
    checkWords(findings, `opening step ${step.id} trigger`, step.trigger, budget.textWords.openingTrigger)
    for (const instruction of step.instructions) checkWords(findings, `opening step ${step.id} instruction for ${instruction.recipientRoleId}`, instruction.text, budget.textWords.openingInstruction)
  }

  if (definition.setupRequirements.length > budget.setupRequirements) findings.push(`quality budget: story has ${definition.setupRequirements.length} setup requirements; maximum ${budget.setupRequirements}`)
  for (const requirement of definition.setupRequirements) checkWords(findings, `setup requirement ${requirement.id}`, requirement.label, budget.textWords.setupRequirement)
  for (const act of definition.acts) {
    checkWords(findings, `act ${act.id} operator goal`, act.operatorGoal, budget.textWords.actGoal)
    checkWords(findings, `act ${act.id} player goal`, act.playerGoal, budget.textWords.actGoal)
  }
  for (const stage of story.evening) checkWords(findings, `evening stage ${stage.id}`, stage.description, budget.textWords.stageDescription)
  for (const deck of definition.clueDecks) {
    for (const clue of deck.clues) {
      const label = `clue ${clue.id}`
      checkWords(findings, label, clue.text, budget.textWords.clue)
      duplicateCandidates.push({ label, text: clue.text })
    }
  }

  findings.push(...duplicateNarrativeFindings(duplicateCandidates))
  return [...new Set(findings)]
}
