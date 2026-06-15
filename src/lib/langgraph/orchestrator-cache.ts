import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"
import type { ExtractedTimetable } from "@/src/types/planning.types"
import type { PlanningGraphAnnotationState } from "./state"
import { timetableToMarkdown } from "./nodes/visionAgent"

export interface CachedAnalysis {
  timetableRaw: string
  isValidTimetable: boolean
  studentProfileContext: string
}

export interface CachedAnalysisResult {
  extractedTimetable: ExtractedTimetable | null
  timetableSummary: string
  isValidTimetable: boolean
  studentProfileContext: string
}

export function tryRestoreCachedAnalysis(cached: CachedAnalysis): CachedAnalysisResult | null {
  const raw = cached.timetableRaw
  if (!raw.trim().startsWith("{")) return null
  try {
    const extractedTimetable = JSON.parse(raw) as ExtractedTimetable
    logger.info(
      { valid: cached.isValidTimetable, profileLength: cached.studentProfileContext.length },
      "[Cache] Restored cached analysis JSON"
    )
    return {
      extractedTimetable,
      timetableSummary: timetableToMarkdown(extractedTimetable),
      isValidTimetable: cached.isValidTimetable,
      studentProfileContext: cached.studentProfileContext,
    }
  } catch {
    logger.warn("Failed to parse cached analysis JSON, invalidating cache")
    return null
  }
}

export async function saveCacheIfChanged(
  profileService: ProfileService,
  userId: string,
  state: PlanningGraphAnnotationState,
  originalTimetable: ExtractedTimetable | null,
  originalProfileContext: string
): Promise<void> {
  const serialized = state.extractedTimetable ? JSON.stringify(state.extractedTimetable) : ""
  const originalSerialized = originalTimetable ? JSON.stringify(originalTimetable) : ""
  const isTimetableChanged = state.extractedTimetable !== null && serialized !== originalSerialized

  if (isTimetableChanged || state.studentProfileContext !== originalProfileContext) {
    const newTimetable = isTimetableChanged ? serialized : undefined
    const newValid = isTimetableChanged ? state.isValidTimetable : undefined
    const newContext = state.studentProfileContext !== originalProfileContext ? state.studentProfileContext : undefined
    await profileService.saveAnalysisCache(userId, newTimetable, newValid, newContext)
  }
}
