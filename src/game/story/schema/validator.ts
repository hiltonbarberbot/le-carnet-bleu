export type DataSchema<T> = {
  readonly name: string
  validate(value: unknown, path?: string): string[]
  is(value: unknown): value is T
  parse(value: unknown, path?: string): T
}

export function defineSchema<T>(name: string, validate: (value: unknown, path: string) => string[]): DataSchema<T> {
  return {
    name,
    validate(value, path = name) {
      return [...new Set(validate(value, path))]
    },
    is(value): value is T {
      return validate(value, name).length === 0
    },
    parse(value, path = name) {
      const errors = validate(value, path)
      if (errors.length) throw new Error(`Invalid ${name}:\n${[...new Set(errors)].join('\n')}`)
      return value as T
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function requireRecord(value: unknown, path: string): string[] {
  return isRecord(value) ? [] : [`${path} must be an object`]
}

export function requireText(value: unknown, path: string): string[] {
  return typeof value === 'string' && value.trim() ? [] : [`${path} must be non-empty text`]
}

export function requireStringList(value: unknown, path: string, options: { allowEmpty?: boolean } = {}): string[] {
  if (!Array.isArray(value)) return [`${path} must be a list`]
  const errors: string[] = []
  if (!options.allowEmpty && value.length === 0) errors.push(`${path} must not be empty`)
  if (value.some(item => typeof item !== 'string' || !item.trim())) errors.push(`${path} must contain non-empty ids`)
  if (new Set(value).size !== value.length) errors.push(`${path} must not contain duplicate ids`)
  return errors
}

export function requireOneOf(value: unknown, allowed: readonly string[], path: string): string[] {
  return typeof value === 'string' && allowed.includes(value) ? [] : [`${path} must be one of ${allowed.join(', ')}`]
}
