import { describe, it, expect, vi } from "vitest"

const mockPinoInstance = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
const mockPino = vi.fn(() => mockPinoInstance)

vi.mock("pino", () => ({ default: mockPino }))

// The logger module is imported once; these tests verify the creation behavior
describe("logger", () => {
  it("exports a logger object with info, error, warn methods", async () => {
    const mod = await import("@/src/lib/logger")
    expect(mod.logger).toBeDefined()
    expect(typeof mod.logger.info).toBe("function")
    expect(typeof mod.logger.error).toBe("function")
    expect(typeof mod.logger.warn).toBe("function")
  })

  it("calls pino constructor on import", () => {
    expect(mockPino).toHaveBeenCalledOnce()
  })

  it("includes level and transport in development config", () => {
    const callArgs = mockPino.mock.calls[0][0]
    expect(callArgs).toHaveProperty("level")
    expect(callArgs).toHaveProperty("transport")
    expect(callArgs.transport).toHaveProperty("target", "pino-pretty")
  })
})
