import type { Character } from '../types.js'

export function getKnownSecrets(character: Character) {
  return character.secrets
}
