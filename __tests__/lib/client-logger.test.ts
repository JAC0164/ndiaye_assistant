import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("clientLogger", () => {
  it("calls console.error with prefixed message", async () => {
    const { clientLogger } = await import("@/src/lib/client-logger")
    clientLogger.error("test error")
    expect(console.error).toHaveBeenCalledWith("[Ndiaye ERROR]", "test error")
  })

  it("calls console.warn with prefixed message", async () => {
    const { clientLogger } = await import("@/src/lib/client-logger")
    clientLogger.warn("test warn")
    expect(console.warn).toHaveBeenCalledWith("[Ndiaye WARN]", "test warn")
  })

  it("calls console.log with prefixed message for info", async () => {
    const { clientLogger } = await import("@/src/lib/client-logger")
    clientLogger.info("test info")
    expect(console.log).toHaveBeenCalledWith("[Ndiaye INFO]", "test info")
  })

  it("calls console.debug with prefixed message for debug in dev", async () => {
    const { clientLogger } = await import("@/src/lib/client-logger")
    clientLogger.debug("test debug")
    expect(console.debug).toHaveBeenCalledWith("[Ndiaye DEBUG]", "test debug")
  })

  it("passes extra args to console methods", async () => {
    const { clientLogger } = await import("@/src/lib/client-logger")
    const extra = { key: "value" }
    clientLogger.error("msg", extra)
    expect(console.error).toHaveBeenCalledWith("[Ndiaye ERROR]", "msg", extra)
  })

  it("skips console.debug in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.resetModules()
    const { clientLogger } = await import("@/src/lib/client-logger")
    clientLogger.debug("should be silent")
    expect(console.debug).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
