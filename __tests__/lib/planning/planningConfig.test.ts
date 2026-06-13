import { describe, it, expect } from "vitest"
import { PLANNING_CONFIG } from "../../../src/lib/planning/planningConfig"

describe("PLANNING_CONFIG", () => {
  it("defines the expected constants and priority bounds", () => {
    expect(PLANNING_CONFIG.priorityAlpha).toBe(3)
    expect(PLANNING_CONFIG.maxSessionMinutes).toBe(45)
    expect(PLANNING_CONFIG.minSessionMinutes).toBe(25)
    expect(PLANNING_CONFIG.minWeeklyMinutesPerSubject).toBe(25)
    expect(PLANNING_CONFIG.maxWeeklyMinutesPerSubject).toBe(120)
  })

  it("has review/td ratios that sum to 1 for all subject types", () => {
    for (const type of ["scientific", "literary", "language", "other"] as const) {
      const ratio = PLANNING_CONFIG.reviewTdRatios[type]
      expect(ratio.review + ratio.td).toBeCloseTo(1.0, 5)
    }
  })

  it("has valid period multipliers", () => {
    expect(PLANNING_CONFIG.periodMultipliers.debut_trimestre).toBe(0.8)
    expect(PLANNING_CONFIG.periodMultipliers.milieu_trimestre).toBe(1.0)
    expect(PLANNING_CONFIG.periodMultipliers.pre_exam).toBe(1.4)
    expect(PLANNING_CONFIG.periodMultipliers.post_exam).toBe(0.6)
  })

  it("has valid performance multipliers", () => {
    expect(PLANNING_CONFIG.performanceMultipliers.strong).toBe(0.8)
    expect(PLANNING_CONFIG.performanceMultipliers.neutral).toBe(1.0)
    expect(PLANNING_CONFIG.performanceMultipliers.weak).toBe(1.3)
    expect(PLANNING_CONFIG.performanceMultipliers.critical).toBe(1.5)
  })
})
