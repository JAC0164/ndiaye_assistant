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
  const subjectMap = new Map<
    string,
    {
      coefficient: number | null
      subjectType: SubjectInfo["subjectType"]
      daysPresent: Set<string>
    }
  >()

  const normalizedExclusionList = exclusionList.map((s) => s.toLowerCase().trim())

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
            daysPresent: new Set<string>(),
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

  const result: SubjectInfo[] = []
  for (const [code, data] of subjectMap.entries()) {
    let coefficient = data.coefficient
    if (coefficient === null || coefficient === undefined) {
      logger.warn(
        { subjectCode: code },
        `[extractSubjects] No coefficient found for subject "${code}" in timetable. Defaulting to 1.`
      )
      coefficient = 1
    }

    result.push({
      name: code,
      coefficient,
      subjectType: data.subjectType,
      daysPresent: Array.from(data.daysPresent),
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
