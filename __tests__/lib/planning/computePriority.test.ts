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
    // defaults: daysSinceLastRevision = 7 (ebbinghausMultiplier = 1.4), performance = neutral (1.0)
    // FR (coeff 5): 5 * (1 + 3 / (7 + 1)) * 1.0 * 1.4 = 5 * 1.375 * 1.4 = 9.625 -> 9.63
    // MATH (coeff 4): 4 * (1 + 3 / (7 + 1)) * 1.0 * 1.4 = 4 * 1.375 * 1.4 = 7.7
    const priority = computePriority(TEST_SUBJECTS, new Map(), new Map())

    expect(priority.get("FR")).toBe(9.63)
    expect(priority.get("MATH")).toBe(7.7)
  })

  it("applies performance level multipliers correctly", () => {
    const perfLevels = new Map<string, PerformanceLevel>([
      ["FR", "weak"], // multiplier 1.3
      ["MATH", "critical"], // multiplier 1.5
    ])
    // daysSinceLastRevision default = 7 (ebbinghausMultiplier = 1.4)
    // FR (coeff 5): 5 * (1 + 3 / (7 + 1)) * 1.3 * 1.4 = 6.875 * 1.3 * 1.4 = 12.5125 -> 12.51
    // MATH (coeff 4): 4 * 1.375 * 1.5 * 1.4 = 11.55
    const priority = computePriority(TEST_SUBJECTS, new Map(), perfLevels)

    expect(priority.get("FR")).toBe(12.51)
    expect(priority.get("MATH")).toBe(11.55)
  })

  it("returns empty map for null subjects (line 15 true branch)", () => {
    const priority = computePriority(null as unknown as SubjectInfo[], new Map(), new Map())
    expect(priority.size).toBe(0)
  })

  it("falls back to multiplier 1.0 for unknown performance level (line 29 ?? fallback)", () => {
    const perfLevels = new Map<string, PerformanceLevel>([["MATH", "unknown" as PerformanceLevel]])
    const priority = computePriority(TEST_SUBJECTS, new Map(), perfLevels)
    // MATH coeff 4, default days=7, multiplier 1.0, ebbinghaus=1.4 → 4 * 1.375 * 1.0 * 1.4 = 7.7
    expect(priority.get("MATH")).toBe(7.7)
  })

  it("uses ressenti feedback when available, falling back to static multiplier", () => {
    const ressenti = new Map<string, number>([["FR", 2.0]]) // moyen → M = 1 + (3-2)*0.25 = 1.25
    // FR (coeff 5), default days=7, ebbinghaus=1.4
    // FR: 5 * 1.375 * 1.25 * 1.4 = 12.03125 → 12.03
    // MATH: no ressenti → uses neutral (1.0), ebbinghaus=1.4: 4 * 1.375 * 1.0 * 1.4 = 7.7
    const priority = computePriority(TEST_SUBJECTS, new Map(), new Map(), ressenti)

    expect(priority.get("FR")).toBe(12.03)
    expect(priority.get("MATH")).toBe(7.7)
  })

  it("ressenti 1 (difficile) produces higher score than ressenti 3 (facile) for same subject", () => {
    const difficile = new Map<string, number>([["FR", 1.0]]) // M = 1 + (3-1)*0.25 = 1.5
    const facile = new Map<string, number>([["FR", 3.0]]) // M = 1 + (3-3)*0.25 = 1.0

    const priorityDifficile = computePriority(TEST_SUBJECTS, new Map(), new Map(), difficile)
    const priorityFacile = computePriority(TEST_SUBJECTS, new Map(), new Map(), facile)

    expect(priorityDifficile.get("FR")!).toBeGreaterThan(priorityFacile.get("FR")!)
  })

  it("falls back to static performance multiplier when no ressenti feedback exists", () => {
    const perfLevels = new Map<string, PerformanceLevel>([["FR", "weak"]]) // multiplier 1.3
    // No ressenti map passed → fallback to static
    const priority = computePriority(TEST_SUBJECTS, new Map(), perfLevels)

    // FR (coeff 5), default days=7, weak=1.3, ebbinghaus=1.4: 5 * 1.375 * 1.3 * 1.4 = 12.51
    expect(priority.get("FR")).toBe(12.51)
  })

  it("incorporates days since last revision correctly", () => {
    const daysSince = new Map<string, number>([
      ["FR", 1], // D_S = 1, ebbinghausMultiplier = 1.0, coeff = 5, perf = neutral (1.0) -> 5 * (1 + 3 / 2) * 1 * 1.0 = 12.5
      ["MATH", 9], // D_S = 9, ebbinghausMultiplier = 1.0, coeff = 4, perf = neutral (1.0) -> 4 * (1 + 3 / 10) * 1 * 1.0 = 5.2
    ])

    const priority = computePriority(TEST_SUBJECTS, daysSince, new Map())

    expect(priority.get("FR")).toBe(12.5)
    expect(priority.get("MATH")).toBe(5.2)
  })

  it("applies Ebbinghaus spaced repetition multiplier at critical intervals", () => {
    const subj: SubjectInfo[] = [{ name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: ["monday"] }]

    // D=0 → ebbinghaus = 1.5 → 4 * (1+3/1) * 1.0 * 1.5 = 4 * 4 * 1.5 = 24.0
    const d0 = computePriority(subj, new Map([["MATH", 0]]), new Map())
    expect(d0.get("MATH")).toBe(24.0)

    // D=2 → ebbinghaus = 1.3 → 4 * (1+3/3) * 1.0 * 1.3 = 4 * 2 * 1.3 = 10.4
    const d2 = computePriority(subj, new Map([["MATH", 2]]), new Map())
    expect(d2.get("MATH")).toBe(10.4)

    // D=3 → ebbinghaus = 1.3 → 4 * (1+3/4) * 1.0 * 1.3 = 4 * 1.75 * 1.3 = 9.1
    const d3 = computePriority(subj, new Map([["MATH", 3]]), new Map())
    expect(d3.get("MATH")).toBe(9.1)

    // D=6 → ebbinghaus = 1.4 → 4 * (1+3/7) * 1.0 * 1.4 = 4 * (10/7) * 1.4 = 8.0
    const d6 = computePriority(subj, new Map([["MATH", 6]]), new Map())
    expect(d6.get("MATH")).toBe(8.0)

    // D=7 → ebbinghaus = 1.4 → 4 * (1+3/8) * 1.0 * 1.4 = 4 * 1.375 * 1.4 = 7.7
    const d7 = computePriority(subj, new Map([["MATH", 7]]), new Map())
    expect(d7.get("MATH")).toBe(7.7)

    // D=5 → ebbinghaus = 1.0 → 4 * (1+3/6) * 1.0 * 1.0 = 4 * 1.5 = 6.0
    const d5 = computePriority(subj, new Map([["MATH", 5]]), new Map())
    expect(d5.get("MATH")).toBe(6.0)
  })
})
