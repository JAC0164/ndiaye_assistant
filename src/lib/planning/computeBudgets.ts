import { SubjectInfo, SubjectBudget } from "@/src/types/planning.types"
import { AcademicPeriod, PLANNING_CONFIG } from "./planningConfig"

/**
 * Compute weekly revision time budgets per subject.
 * Proportional to coefficient, with floor/ceiling + period scaling + review/td split.
 */
export function computeBudgets(
  subjects: SubjectInfo[],
  totalAvailableMinutes: number,
  period: AcademicPeriod
): Map<string, SubjectBudget> {
  const result = new Map<string, SubjectBudget>()
  if (!subjects || subjects.length === 0) {
    return result
  }

  // 1. Scale total available minutes based on academic period
  const periodMultiplier = PLANNING_CONFIG.periodMultipliers[period] ?? 1.0
  const adjustedTotal = totalAvailableMinutes * periodMultiplier

  // 2. Sum of all coefficients
  const sumCoeff = subjects.reduce((sum, s) => sum + s.coefficient, 0)
  if (sumCoeff === 0) {
    return result
  }

  // 3. Compute raw budgets and initial clamped budgets
  const clampedBudgets = new Map<string, number>()
  let totalClamped = 0

  for (const subject of subjects) {
    const rawBudget = (subject.coefficient / sumCoeff) * adjustedTotal
    const clamped = Math.max(
      PLANNING_CONFIG.minWeeklyMinutesPerSubject,
      Math.min(PLANNING_CONFIG.maxWeeklyMinutesPerSubject, rawBudget)
    )
    clampedBudgets.set(subject.name, clamped)
    totalClamped += clamped
  }

  // 4. Single-iteration redistribution of surplus/deficit
  const difference = adjustedTotal - totalClamped

  if (Math.abs(difference) > 0.1) {
    // Find eligible subjects for redistribution
    const eligibleSubjects = subjects.filter((subject) => {
      const current = clampedBudgets.get(subject.name)!
      if (difference > 0) {
        // We have surplus: subjects below max are eligible to receive more
        return current < PLANNING_CONFIG.maxWeeklyMinutesPerSubject
      } else {
        // We have deficit: subjects above min are eligible to lose some
        return current > PLANNING_CONFIG.minWeeklyMinutesPerSubject
      }
    })

    const eligibleCoeffSum = eligibleSubjects.reduce((sum, s) => sum + s.coefficient, 0)
    if (eligibleCoeffSum > 0) {
      for (const subject of eligibleSubjects) {
        const current = clampedBudgets.get(subject.name)!
        const share = (subject.coefficient / eligibleCoeffSum) * difference
        const updated = Math.max(
          PLANNING_CONFIG.minWeeklyMinutesPerSubject,
          Math.min(PLANNING_CONFIG.maxWeeklyMinutesPerSubject, current + share)
        )
        clampedBudgets.set(subject.name, updated)
      }
    }
  }

  // 5. Round to nearest 5 minutes and compute review/td split
  for (const subject of subjects) {
    const finalBudget = clampedBudgets.get(subject.name)!

    // Round total to nearest 5 minutes
    let roundedTotal = Math.round(finalBudget / 5) * 5
    // Ensure we still respect min/max bounds after rounding
    roundedTotal = Math.max(
      PLANNING_CONFIG.minWeeklyMinutesPerSubject,
      Math.min(PLANNING_CONFIG.maxWeeklyMinutesPerSubject, roundedTotal)
    )

    // Get review/td ratios
    const ratio = PLANNING_CONFIG.reviewTdRatios[subject.subjectType] || PLANNING_CONFIG.reviewTdRatios.other

    // Round reviewMinutes to nearest 5 minutes
    let reviewMinutes = Math.round((roundedTotal * ratio.review) / 5) * 5
    // tdMinutes gets the remainder (which is automatically a multiple of 5)
    let tdMinutes = roundedTotal - reviewMinutes

    result.set(subject.name, {
      totalMinutes: roundedTotal,
      reviewMinutes,
      tdMinutes,
    })
  }

  return result
}
