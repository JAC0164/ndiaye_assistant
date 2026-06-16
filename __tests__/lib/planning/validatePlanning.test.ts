import { describe, it, expect } from "vitest"
import { validatePlanning } from "../../../src/lib/planning/validatePlanning"

describe("validatePlanning pass-through", () => {
  it("returns the input planning unchanged", () => {
    const result = validatePlanning([], "22:00", [])
    expect(result.validatedPlanning).toEqual([])
    expect(result.wasRepaired).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.removedSessions).toEqual([])
  })
})
