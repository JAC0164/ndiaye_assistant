export async function withRetry<T>(
  fn: () => Promise<T>,
  agentName: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
      console.warn(
        `\x1b[33m[Retry] ${agentName.toUpperCase()} | Attempt ${attempt}/${maxRetries} failed. Retrying in ${delay}ms...\x1b[0m`
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error(`Unreachable: ${agentName} retry exhausted`)
}
