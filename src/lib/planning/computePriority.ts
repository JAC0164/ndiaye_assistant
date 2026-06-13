import { SubjectInfo } from "@/src/types/planning.types"
import { PerformanceLevel, PLANNING_CONFIG } from "./planningConfig"

/**
 * Compute dynamic priority scores for subject ordering.
 * Formula: Score(S) = C_S * (1 + α / (D_S + 1)) * M_S
 */
export function computePriority(
  subjects: SubjectInfo[],
  daysSinceLastRevision: Map<string, number>,
  performanceLevels: Map<string, PerformanceLevel>
): Map<string, number> {
  const result = new Map<string, number>()
  if (!subjects) {
    return result
  }

  const alpha = PLANNING_CONFIG.priorityAlpha

  for (const subject of subjects) {
    const c_s = subject.coefficient

    // Days since last revision: default to 7 if not specified
    const d_s = daysSinceLastRevision.has(subject.name)
      ? daysSinceLastRevision.get(subject.name)!
      : 7

    // Performance level: default to "neutral" if not specified
    const perfLevel = performanceLevels.has(subject.name)
      ? performanceLevels.get(subject.name)!
      : "neutral"

    const m_s = PLANNING_CONFIG.performanceMultipliers[perfLevel] ?? 1.0

    // Score(S) = C_S * (1 + α / (D_S + 1)) * M_S
    const score = c_s * (1 + alpha / (d_s + 1)) * m_s

    // Round to 2 decimal places
    const roundedScore = Math.round(score * 100) / 100

    result.set(subject.name, roundedScore)
  }

  return result
}
