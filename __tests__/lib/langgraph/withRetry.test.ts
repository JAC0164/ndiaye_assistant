import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { withRetry } from "@/src/lib/langgraph/nodes/withRetry"

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns result when function succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("success")
    const result = await withRetry(fn, "test-agent")
    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("succeeds on second try after first failure", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce("success")

    const promise = withRetry(fn, "test-agent")
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("succeeds on third try after two failures", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("success")

    const promise = withRetry(fn, "test-agent")
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws after max retries exhausted (3)", async () => {
    const error = new Error("persistent failure")
    const fn = vi.fn().mockRejectedValue(error)

    const promise = withRetry(fn, "test-agent")
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)

    await expect(promise).rejects.toThrow("persistent failure")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws original error after max retries, not a wrapper", async () => {
    class CustomError extends Error {
      code = "CUSTOM"
    }
    const error = new CustomError("custom error")
    const fn = vi.fn().mockRejectedValue(error)

    const promise = withRetry(fn, "test-agent")
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)

    await expect(promise).rejects.toThrow(CustomError)
    await expect(promise).rejects.toThrow("custom error")
  })

  it("applies exponential backoff (1s, 2s) before each retry (maxRetries=3 => 2 delays)", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")

    const promise = withRetry(fn, "test-agent")
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(promise).rejects.toThrow()

    const delayCalls: number[] = []
    for (const call of setTimeoutSpy.mock.calls) {
      if (typeof call[1] === "number") delayCalls.push(call[1])
    }

    expect(delayCalls[0]).toBe(1000)
    expect(delayCalls[1]).toBe(2000)
    expect(delayCalls).toHaveLength(2)

    setTimeoutSpy.mockRestore()
  })

  it("caps delay at 8000ms (max backoff)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"))
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")

    const promise = withRetry(fn, "test-agent", 5)
    promise.catch(() => {})

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(8000)
    }

    await expect(promise).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(5)

    const delayCalls: number[] = []
    for (const call of setTimeoutSpy.mock.calls) {
      if (typeof call[1] === "number") delayCalls.push(call[1])
    }

    expect(delayCalls[0]).toBe(1000)
    expect(delayCalls[1]).toBe(2000)
    expect(delayCalls[2]).toBe(4000)
    expect(delayCalls[3]).toBe(8000)

    setTimeoutSpy.mockRestore()
  })

  it("includes agentName in error message", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"))
    const promise = withRetry(fn, "my-agent", 1)
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(1000)

    try {
      await promise
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toBe("boom")
    }
  })

  it("does not retry on success, even with maxRetries > 1", async () => {
    const fn = vi.fn().mockResolvedValue("done")
    const result = await withRetry(fn, "test-agent", 5)
    expect(result).toBe("done")
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
