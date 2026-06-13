import { logger } from "@/src/lib/logger"

const DEFAULT_MAX_RETRIES = Number(process.env.NDIAYE_RETRY_MAX ?? 3)

export async function withRetry<T>(
  fn: () => Promise<T>,
  agentName: string,
  maxRetries = DEFAULT_MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
      logger.warn({ agent: agentName, attempt, maxRetries, delay }, "[Retry] Attempt failed, retrying")
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error(`Unreachable: ${agentName} retry exhausted`)
}
