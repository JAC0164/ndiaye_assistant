import { ExtractedTimetable, SubjectInfo } from "@/src/types/planning.types"
import { PLANNING_CONFIG } from "./planningConfig"
import { logger } from "@/src/lib/logger"

/**
 * Extract unique revisable subjects from the structured timetable.
 * Excludes subjects in the configurable exclusion list.
 * Returns the ALLOWLIST — only these subjects may appear in the final planning.
 */
export function extractSubjects(
  timetable: ExtractedTimetable,
  exclusionList: string[] = [...PLANNING_CONFIG.subjectExclusionList]
): SubjectInfo[] {
  const subjectMap = new Map<string, {
    coefficient: number | null
    subjectType: SubjectInfo["subjectType"]
    daysPresent: Set<string>
  }>()

  const normalizedExclusionList = exclusionList.map(s => s.toLowerCase().trim())

  if (timetable && timetable.days) {
    for (const dayEntry of timetable.days) {
      if (!dayEntry.slots) continue
      for (const slot of dayEntry.slots) {
        if (!slot.subject) continue
        
        const subjectCode = slot.subject.trim().toUpperCase()
        if (normalizedExclusionList.includes(subjectCode.toLowerCase())) {
          continue
        }

        let existing = subjectMap.get(subjectCode)
        if (!existing) {
          existing = {
            coefficient: slot.coefficient,
            subjectType: slot.subject_type || "other",
            daysPresent: new Set<string>()
          }
          subjectMap.set(subjectCode, existing)
        }

        // Keep non-null coefficient if we find it
        if (existing.coefficient === null && slot.coefficient !== null) {
          existing.coefficient = slot.coefficient
        }
        // Keep correct type if we find it
        if (slot.subject_type && existing.subjectType === "other") {
          existing.subjectType = slot.subject_type
        }

        existing.daysPresent.add(dayEntry.day)
      }
    }
  }

const DEFAULT_COEFFICIENTS: Record<string, number> = {
  MATH: 4,
  FR: 4,
  PC: 3,
  SVT: 3,
  HG: 2,
  ANG: 2,
  ESP: 2,
  ALL: 2,
  ARA: 2,
  ECO: 2,
  PHILO: 2,
  CIV: 1,
  EPS: 1,
}

  const result: SubjectInfo[] = []
  for (const [code, data] of subjectMap.entries()) {
    let coefficient = data.coefficient
    if (coefficient === null || coefficient === undefined) {
      const fallbackCoeff = DEFAULT_COEFFICIENTS[code] ?? 1
      logger.warn(
        { subjectCode: code, fallback: fallbackCoeff },
        `[extractSubjects] No coefficient found for subject "${code}" in database. Defaulting to ${fallbackCoeff}.`
      )
      coefficient = fallbackCoeff
    }

    result.push({
      name: code,
      coefficient,
      subjectType: data.subjectType,
      daysPresent: Array.from(data.daysPresent)
    })
  }

  // Sort by coefficient descending, and then by name alphabetically for deterministic ordering
  return result.sort((a, b) => {
    if (b.coefficient !== a.coefficient) {
      return b.coefficient - a.coefficient
    }
    return a.name.localeCompare(b.name)
  })
}
