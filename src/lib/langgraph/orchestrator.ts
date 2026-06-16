import { ProfileService } from "@/src/services/profile.service"
import type { ExtractedTimetable } from "@/src/types/planning.types"
import { SupabaseClient } from "@supabase/supabase-js"
import { createPlanningGraph } from "./graph"
import { saveCacheIfChanged, tryRestoreCachedAnalysis } from "./orchestrator-cache"
import { fetchCoefficientTable } from "./orchestrator-data"
import { validatePostGraph } from "./orchestrator-validation"
import type { PlanningGraphAnnotationState } from "./state"

export type PlanningWorkflowResult = PlanningGraphAnnotationState

export async function runPlanningWorkflow(
  supabase: SupabaseClient,
  userId: string,
  imageBuffer: Buffer,
  onboardingData: unknown,
  imageMimeType = "image/jpeg"
): Promise<PlanningWorkflowResult> {
  let extractedTimetable: ExtractedTimetable | null = null
  let timetableSummary = ""
  let isValidTimetable = true
  let studentProfileContext = ""

  const profileService = new ProfileService(supabase)
  const profile = await profileService.getByUserId(userId)
  const cached = profile ? await profileService.getCachedAnalysis(userId, profile) : null

  const cachedResult = cached ? tryRestoreCachedAnalysis(cached) : null
  if (cachedResult) {
    extractedTimetable = cachedResult.extractedTimetable
    timetableSummary = cachedResult.timetableSummary
    isValidTimetable = cachedResult.isValidTimetable
    studentProfileContext = cachedResult.studentProfileContext
  }

  const classId = profile?.class_id

  const { coefficientTable, classSeriesName } = await fetchCoefficientTable(supabase, classId)

  const graph = createPlanningGraph()
  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
    coefficientTable,
    classSeriesName,
    timetableSummary,
    isValidTimetable,
    studentProfileContext,
    extractedTimetable,
    preplannerConstraints: "",
    planningValidation: null,
  })

  validatePostGraph(state, onboardingData)
  await saveCacheIfChanged(profileService, userId, state, extractedTimetable, studentProfileContext)

  return state
}
