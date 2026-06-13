import { describe, it, expect } from "vitest"
import { computeBudgets } from "../../../src/lib/planning/computeBudgets"
import { SubjectInfo } from "../../../src/types/planning.types"

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
