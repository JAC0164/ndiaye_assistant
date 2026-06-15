import type { PlanningGraphAnnotationState } from "./state"
import type { OnboardingForm } from "@/src/types/planning.types"
import type { AcademicPeriod } from "../planning/planningConfig"
import { extractSubjects } from "../planning/extractSubjects"
import { buildFreeSlots } from "../planning/buildFreeSlots"
import { computeBudgets } from "../planning/computeBudgets"
import { validatePlanning } from "../planning/validatePlanning"
import { logger } from "@/src/lib/logger"

export function validatePostGraph(state: PlanningGraphAnnotationState, onboardingData: unknown): void {
  if (!state.isValidTimetable || !state.extractedTimetable) return
  try {
    const subjects = extractSubjects(state.extractedTimetable)
    const allowedSubjects = subjects.map((s) => s.name)
    const onboarding = onboardingData as OnboardingForm
    const bedtime = onboarding?.bedtime || "22:00"
    const blockedSlots = onboarding?.blockedSlots || []
    const rawPeriod = onboarding?.academicPeriod
    const period: AcademicPeriod = (
      rawPeriod && ["debut_trimestre", "milieu_trimestre", "pre_exam", "post_exam"].includes(rawPeriod)
        ? rawPeriod
        : "milieu_trimestre"
    ) as AcademicPeriod
    const freeSlots = buildFreeSlots(state.extractedTimetable, bedtime, blockedSlots)
    const totalAvailableMinutes = freeSlots.reduce((sum, slot) => sum + slot.durationMinutes, 0)
    const budgets = computeBudgets(subjects, totalAvailableMinutes, period)
    const validation = validatePlanning(state.generatedPlanning, allowedSubjects, bedtime, blockedSlots, {
      budgets,
      weakSubjects: onboarding?.weakSubjects || [],
      allSubjects: subjects,
    })
    state.planningValidation = validation
    state.generatedPlanning = validation.validatedPlanning
  } catch (err) {
    logger.error({ err }, "Failed to run post-graph planning validation")
  }
}
