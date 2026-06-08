import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkRateLimit } from "../../src/lib/rate-limit"

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns true for first 10 requests with same key", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("test-key")).toBe(true)
    }
  })

  it("returns false on 11th request within 60s window", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("burst-key")
    }
    expect(checkRateLimit("burst-key")).toBe(false)
  })

  it("allows new requests after the 60s window expires", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("window-key")
    }
    expect(checkRateLimit("window-key")).toBe(false)

    vi.advanceTimersByTime(60_001)

    expect(checkRateLimit("window-key")).toBe(true)
  })

  it("different keys have independent counters", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("key-a")
    }
    expect(checkRateLimit("key-a")).toBe(false)
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("key-b")).toBe(true)
    }
  })

  it("returns true for requests with different keys even if one is blocked", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("blocked-key")
    }
    expect(checkRateLimit("blocked-key")).toBe(false)

    expect(checkRateLimit("free-key")).toBe(true)
    expect(checkRateLimit("free-key")).toBe(true)
  })

  it("handles keys with special characters", () => {
    expect(checkRateLimit("user@domain.com")).toBe(true)
    expect(checkRateLimit("api-key-123!")).toBe(true)
    expect(checkRateLimit("session:id#42")).toBe(true)
    expect(checkRateLimit("")).toBe(true)
    expect(checkRateLimit("a".repeat(1000))).toBe(true)
  })

  it("resets counter and starts a fresh window after expiration", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("cyclic-key")
    }
    expect(checkRateLimit("cyclic-key")).toBe(false)

    vi.advanceTimersByTime(60_001)

    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("cyclic-key")).toBe(true)
    }
    expect(checkRateLimit("cyclic-key")).toBe(false)
  })

  it("maintains separate reset timers per key", () => {
    checkRateLimit("early-key")
    vi.advanceTimersByTime(30_000)
    for (let i = 0; i < 9; i++) {
      checkRateLimit("early-key")
    }
    expect(checkRateLimit("early-key")).toBe(false)

    expect(checkRateLimit("late-key")).toBe(true)

    vi.advanceTimersByTime(30_001)
    expect(checkRateLimit("early-key")).toBe(true)
  })

  it("does not allow negative count when called within same millisecond", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("race-key")
    }
    expect(checkRateLimit("race-key")).toBe(false)
  })
})
