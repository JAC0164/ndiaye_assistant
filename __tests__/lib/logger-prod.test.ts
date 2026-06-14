import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("pino", () => ({
  default: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}))

describe("logger in production", () => {
  beforeAll(() => {
    vi.unstubAllEnvs()
    vi.stubEnv("NODE_ENV", "production")
  })

  it("creates logger with warn level and no transport", async () => {
    const pino = await import("pino")
    const mod = await import("@/src/lib/logger")

    expect(mod.logger).toBeDefined()
    const callArgs = (pino.default as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.level).toBe("warn")
    expect(callArgs.transport).toBeUndefined()
  })
})
