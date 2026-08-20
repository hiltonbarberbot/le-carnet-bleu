export const defaultAiCallTimeoutMs = 5 * 60 * 1_000

export function resolveAiCallTimeoutMs(value = process.env.AI_GATEWAY_CALL_TIMEOUT_MS) {
  if (!value) return defaultAiCallTimeoutMs
  const timeoutMs = Number(value)
  return Number.isSafeInteger(timeoutMs) && timeoutMs >= 10_000 && timeoutMs <= 10 * 60 * 1_000
    ? timeoutMs
    : defaultAiCallTimeoutMs
}

export function createAiCallSignal() {
  return AbortSignal.timeout(resolveAiCallTimeoutMs())
}
