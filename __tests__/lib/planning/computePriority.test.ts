import { describe, it, expect } from "vitest"
import { computePriority } from "../../../src/lib/planning/computePriority"
import { SubjectInfo } from "../../../src/types/planning.types"
import { PerformanceLevel } from "../../../src/lib/planning/planningConfig"

const TEST_SUBJECTS: SubjectInfo[] = [
  { name: "FR", coefficient: 5, subjectType: "literary", daysPresent: ["monday"] },
  { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: ["monday"] },
]

describe("computePriority", () => {
  it("computes scores using the standard formula and default values", () => {
    // defaults: daysSinceLastRevision = 7, performance = neutral (1.0)
    // FR (coeff 5): 5 * (1 + 3 / (7 + 1)) * 1.0 = 5 * (1 + 0.375) * 1 = 6.875 -> 6.88
    // MATH (coeff 4): 4 * (1 + 3 / (7 + 1)) * 1.0 = 4 * 1.375 * 1 = 5.5
    const priority = computePriority(TEST_SUBJECTS, new Map(), new Map())

    expect(priority.get("FR")).toBe(6.88)
    expect(priority.get("MATH")).toBe(5.5)
  })

  it("applies performance level multipliers correctly", () => {
    const perfLevels = new Map<string, PerformanceLevel>([
      ["FR", "weak"], // multiplier 1.3
      ["MATH", "critical"], // multiplier 1.5
    ])
    // daysSinceLastRevision default = 7
    // FR (coeff 5): 5 * (1 + 3 / (7 + 1)) * 1.3 = 6.875 * 1.3 = 8.9375 -> 8.94
    // MATH (coeff 4): 4 * 1.375 * 1.5 = 5.5 * 1.5 = 8.25
    const priority = computePriority(TEST_SUBJECTS, new Map(), perfLevels)

    expect(priority.get("FR")).toBe(8.94)
    expect(priority.get("MATH")).toBe(8.25)
  })

  it("returns empty map for null subjects (line 15 true branch)", () => {
    const priority = computePriority(null as unknown as SubjectInfo[], new Map(), new Map())
    expect(priority.size).toBe(0)
  })

  it("falls back to multiplier 1.0 for unknown performance level (line 29 ?? fallback)", () => {
    const perfLevels = new Map<string, PerformanceLevel>([["MATH", "unknown" as PerformanceLevel]])
    const priority = computePriority(TEST_SUBJECTS, new Map(), perfLevels)
    // MATH coeff 4, default days=7, multiplier 1.0 → 4 * (1 + 3/8) * 1.0 = 4 * 1.375 = 5.5
    expect(priority.get("MATH")).toBe(5.5)
  })

  it("incorporates days since last revision correctly", () => {
    const daysSince = new Map<string, number>([
      ["FR", 1], // D_S = 1, coeff = 5, perf = neutral (1.0) -> 5 * (1 + 3 / 2) * 1 = 12.5
      ["MATH", 9], // D_S = 9, coeff = 4, perf = neutral (1.0) -> 4 * (1 + 3 / 10) * 1 = 5.2
    ])

    const priority = computePriority(TEST_SUBJECTS, daysSince, new Map())

    expect(priority.get("FR")).toBe(12.5)
    expect(priority.get("MATH")).toBe(5.2)
  })
})
