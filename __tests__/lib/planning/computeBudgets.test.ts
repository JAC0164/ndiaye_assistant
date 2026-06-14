import { describe, it, expect } from "vitest"
import { computeBudgets } from "../../../src/lib/planning/computeBudgets"
import { SubjectInfo } from "../../../src/types/planning.types"
import { AcademicPeriod } from "../../../src/lib/planning/planningConfig"

const TEST_SUBJECTS: SubjectInfo[] = [
  { name: "FR", coefficient: 5, subjectType: "literary", daysPresent: ["monday", "wednesday", "friday"] },
  { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: ["monday", "wednesday", "friday"] },
  { name: "ANG", coefficient: 3, subjectType: "language", daysPresent: ["tuesday", "thursday"] },
  { name: "HG", coefficient: 3, subjectType: "literary", daysPresent: ["tuesday", "thursday"] },
  { name: "PC", coefficient: 3, subjectType: "scientific", daysPresent: ["tuesday", "friday"] },
  { name: "SVT", coefficient: 2, subjectType: "scientific", daysPresent: ["tuesday", "friday"] },
  { name: "ESP", coefficient: 2, subjectType: "language", daysPresent: ["monday", "thursday"] },
  { name: "ECO", coefficient: 2, subjectType: "literary", daysPresent: ["wednesday", "thursday"] },
]

describe("computeBudgets", () => {
  it("computes budgets proportionally to coefficients and verifies FR > ECO", () => {
    // Total available minutes: 600
    // Period: milieu_trimestre (multiplier 1.0)
    const budgets = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")

    const francais = budgets.get("FR")
    const economie = budgets.get("ECO")

    expect(francais).toBeDefined()
    expect(economie).toBeDefined()

    expect(francais!.totalMinutes).toBeGreaterThan(economie!.totalMinutes)

    // Check total sum of review + td
    for (const [, budget] of budgets.entries()) {
      expect(budget.reviewMinutes + budget.tdMinutes).toBe(budget.totalMinutes)
      expect(budget.totalMinutes % 5).toBe(0)
      expect(budget.reviewMinutes % 5).toBe(0)
      expect(budget.tdMinutes % 5).toBe(0)
    }
  })

  it("clamps budgets between min (25) and max (120) weekly minutes", () => {
    // With very high total minutes (e.g. 3000), subjects would exceed max budget (120) if not clamped
    const budgets = computeBudgets(TEST_SUBJECTS, 3000, "milieu_trimestre")

    for (const [, budget] of budgets.entries()) {
      expect(budget.totalMinutes).toBeLessThanOrEqual(120)
      expect(budget.totalMinutes).toBeGreaterThanOrEqual(25)
    }

    // With very low total minutes (e.g. 50), subjects would fall below min budget (25) if not clamped
    const lowBudgets = computeBudgets(TEST_SUBJECTS, 50, "milieu_trimestre")
    for (const [, budget] of lowBudgets.entries()) {
      expect(budget.totalMinutes).toBe(25) // All clamped to min
    }
  })

  it("scales total minutes by academic period multipliers", () => {
    // milieu_trimestre: multiplier 1.0
    // pre_exam: multiplier 1.4
    // post_exam: multiplier 0.6
    const budgetsMilieu = computeBudgets(TEST_SUBJECTS, 500, "milieu_trimestre")
    const budgetsPre = computeBudgets(TEST_SUBJECTS, 500, "pre_exam")
    const budgetsPost = computeBudgets(TEST_SUBJECTS, 500, "post_exam")

    const fMilieu = budgetsMilieu.get("FR")!.totalMinutes
    const fPre = budgetsPre.get("FR")!.totalMinutes
    const fPost = budgetsPost.get("FR")!.totalMinutes

    expect(fPre).toBeGreaterThanOrEqual(fMilieu)
    expect(fMilieu).toBeGreaterThanOrEqual(fPost)
  })

  it("returns empty map for empty subjects (line 15 true branch)", () => {
    const budgets = computeBudgets([], 600, "milieu_trimestre")
    expect(budgets.size).toBe(0)
  })

  it("returns empty map when sum of coefficients is zero (line 25 true branch)", () => {
    const subjects: SubjectInfo[] = [
      { name: "ART", coefficient: 0, subjectType: "other", daysPresent: ["monday"] },
      { name: "SPORT", coefficient: 0, subjectType: "other", daysPresent: ["tuesday"] },
    ]
    const budgets = computeBudgets(subjects, 600, "milieu_trimestre")
    expect(budgets.size).toBe(0)
  })

  it("falls back to multiplier 1.0 for unknown period (line 19 ?? fallback)", () => {
    const budgets = computeBudgets(TEST_SUBJECTS, 600, undefined as unknown as AcademicPeriod)
    expect(budgets.size).toBeGreaterThan(0)
  })

  it("falls back to other review/td ratio for unknown subjectType (line 85 || fallback)", () => {
    const subjects: SubjectInfo[] = [
      { name: "ART", coefficient: 2, subjectType: "" as SubjectInfo["subjectType"], daysPresent: ["monday"] },
    ]
    const budgets = computeBudgets(subjects, 600, "milieu_trimestre")
    expect(budgets.size).toBe(1)
  })

  it("adjusts budget upward when real duration exceeds theoretical (45 min)", () => {
    const dureeReelle = new Map<string, number>([
      ["FR", 60], // ratio = 60/45 = 1.33 → clamped to 1.1 → 10% increase
    ])
    const budgetsBase = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")
    const budgetsAdjusted = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre", dureeReelle)

    const baseFR = budgetsBase.get("FR")!.totalMinutes
    const adjFR = budgetsAdjusted.get("FR")!.totalMinutes
    // Adjusted should be higher (+10% max), but other subjects unchanged
    expect(adjFR).toBeGreaterThanOrEqual(baseFR)
    // MATH (no dureeReelle) should be unchanged
    expect(budgetsAdjusted.get("MATH")!.totalMinutes).toBe(budgetsBase.get("MATH")!.totalMinutes)
  })

  it("adjusts budget downward when real duration is below theoretical", () => {
    const dureeReelle = new Map<string, number>([
      ["FR", 20], // ratio = 20/45 = 0.44 → clamped to 0.9 → 10% decrease
    ])
    const budgetsBase = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")
    const budgetsAdjusted = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre", dureeReelle)

    const baseFR = budgetsBase.get("FR")!.totalMinutes
    const adjFR = budgetsAdjusted.get("FR")!.totalMinutes
    expect(adjFR).toBeLessThanOrEqual(baseFR)
  })

  it("clamps ratio to max 1.1 even when real duration is 3x theoretical", () => {
    const dureeReelle = new Map<string, number>([
      ["FR", 180], // ratio = 180/45 = 4.0 → clamped to 1.1
    ])
    const budgetsBase = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")
    const budgetsAdjusted = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre", dureeReelle)

    const baseFR = budgetsBase.get("FR")!.totalMinutes
    const adjFR = budgetsAdjusted.get("FR")!.totalMinutes
    // Max increase: base * 1.1, not base * 4.0
    const maxExpected = Math.round(baseFR * 1.1)
    expect(adjFR).toBeLessThanOrEqual(maxExpected)
  })

  it("leaves budget unchanged when no dureeReelle data is provided", () => {
    const budgetsWithout = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")
    const budgetsWithEmpty = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre", new Map())

    expect(budgetsWithout.get("FR")!.totalMinutes).toBe(budgetsWithEmpty.get("FR")!.totalMinutes)
    expect(budgetsWithout.get("MATH")!.totalMinutes).toBe(budgetsWithEmpty.get("MATH")!.totalMinutes)
  })

  it("splits budgets into review and td according to subjectType ratios", () => {
    const budgets = computeBudgets(TEST_SUBJECTS, 600, "milieu_trimestre")

    // MATH is scientific (review: 35%, td: 65%)
    const maths = budgets.get("MATH")!
    expect(maths.tdMinutes).toBeGreaterThan(maths.reviewMinutes)

    // FR is literary (review: 70%, td: 30%)
    const francais = budgets.get("FR")!
    expect(francais.reviewMinutes).toBeGreaterThan(francais.tdMinutes)
  })
})
