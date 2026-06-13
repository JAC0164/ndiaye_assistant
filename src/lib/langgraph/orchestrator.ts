import { SupabaseClient } from "@supabase/supabase-js"
import { CoefficientService } from "@/src/services/coefficient.service"
import { EcheanceService } from "@/src/services/echeance.service"
import { HistoriqueService } from "@/src/services/historique.service"
import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"
import { createPlanningGraph } from "./graph"
import type { OnboardingForm, ExtractedTimetable } from "@/src/types/planning.types"
import type { PlanningGraphState } from "./state"
import type { ModelOverrides } from "./providers"
import { extractSubjects } from "../planning/extractSubjects"
import { validatePlanning } from "../planning/validatePlanning"
import { timetableToMarkdown } from "./nodes/visionAgent"

export type PlanningWorkflowResult = PlanningGraphState

const COEFFICIENTS_CACHE_TTL = Number(process.env.COEFFICIENTS_CACHE_TTL ?? 3_600_000)
const COEFFICIENTS_CACHE_MAX = 50
const coefficientsCache = new Map<string, { data: string; expiry: number; order: number }>()
let cacheOrderCounter = 0

function getCachedCoefficients(className: string): string | null {
  const entry = coefficientsCache.get(className)
  if (entry && Date.now() < entry.expiry) return entry.data
  coefficientsCache.delete(className)
  return null
}

function setCachedCoefficients(className: string, data: string): void {
  if (coefficientsCache.size >= COEFFICIENTS_CACHE_MAX) {
    let oldestKey: string | null = null
    let oldestOrder = Infinity
    for (const [k, v] of coefficientsCache) {
      if (v.order < oldestOrder) {
        oldestOrder = v.order
        oldestKey = k
      }
    }
    coefficientsCache.delete(oldestKey!)
  }
  coefficientsCache.set(className, {
    data,
    expiry: Date.now() + COEFFICIENTS_CACHE_TTL,
    order: ++cacheOrderCounter,
  })
}

export async function runPlanningWorkflow(
  supabase: SupabaseClient,
  userId: string,
  imageBuffer: Buffer,
  onboardingData: unknown,
  imageMimeType = "image/jpeg",
  modelOverrides?: ModelOverrides
): Promise<PlanningWorkflowResult> {
  let extractedTimetable: ExtractedTimetable | null = null
  let extractedTimetableMarkdown = ""
  let isValidTimetable = true
  let studentProfileContext = ""
  let coefficientTable = ""
  let weeklyStats = ""
  let daysSinceLastRevision = new Map<string, number>()

  const profileService = new ProfileService(supabase)
  const profile = await profileService.getByUserId(userId)
  const cached = profile ? await profileService.getCachedAnalysis(userId) : null

  if (cached) {
    const rawTimetable = cached.extractedTimetableMarkdown
    if (rawTimetable.trim().startsWith("{")) {
      try {
        extractedTimetable = JSON.parse(rawTimetable) as ExtractedTimetable
        isValidTimetable = cached.isValidTimetable
        studentProfileContext = cached.studentProfileContext
        extractedTimetableMarkdown = timetableToMarkdown(extractedTimetable)
        logger.info(
          {
            valid: isValidTimetable,
            profileLength: studentProfileContext.length,
          },
          "[Cache] Restored cached analysis JSON"
        )
      } catch {
        logger.warn("Failed to parse cached analysis JSON, invalidating cache")
      }
    }
  }

  // Fetch days since last revision from DB
  try {
    const historiqueService = new HistoriqueService(supabase)
    daysSinceLastRevision = await historiqueService.getDaysSinceLastRevisionBySubject(userId)
  } catch (err) {
    logger.error({ err }, "Failed to fetch days since last revision")
  }

  // Fetch coefficients from DB
  try {
    const classId = profile?.class_id
    if (classId) {
      const cachedStr = getCachedCoefficients(classId)
      if (cachedStr) {
        coefficientTable = cachedStr
      } else {
        const coeffService = new CoefficientService(supabase)
        const coeffs = await coeffService.getByClassId(classId)
        if (coeffs.length > 0) {
          coefficientTable = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
          setCachedCoefficients(classId, coefficientTable)
        }
      }
    } else {
      // Fallback to Terminale S1 coefficients if no class_id is set
      const fallbackClassName = "Terminale S1"
      const cachedStr = getCachedCoefficients(fallbackClassName)
      if (cachedStr) {
        coefficientTable = cachedStr
      } else {
        const coeffService = new CoefficientService(supabase)
        const coeffs = await coeffService.getCoefficientsByClassName(fallbackClassName)
        if (coeffs.length > 0) {
          coefficientTable = coeffs.map((c) => `- ${c.subject.toUpperCase()}: ${c.coefficient}`).join("\n")
          setCachedCoefficients(fallbackClassName, coefficientTable)
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch coefficients for AI workflow")
  }

  // Fetch weekly stats from DB
  try {
    const historiqueService = new HistoriqueService(supabase)
    const stats = await historiqueService.getWeeklyStats(userId)
    if (stats.sessionCount > 0) {
      const lines: string[] = []
      lines.push(`Total : ${stats.totalMinutes} min de révision (${stats.sessionCount} sessions)`)
      if (stats.averageRating !== null) lines.push(`Note moyenne : ${stats.averageRating}/5`)
      const subjects = Object.entries(stats.completedBySubject)
        .map(([s, n]) => `${s} ${n}x`)
        .join(", ")
      if (subjects) lines.push(`Répartition : ${subjects}`)
      weeklyStats = lines.join("\n")
      logger.info(
        { sessionCount: stats.sessionCount, totalMinutes: stats.totalMinutes, averageRating: stats.averageRating },
        "[Feedback] Weekly stats"
      )
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch weekly stats")
  }

  // Fetch upcoming deadlines from DB
  let upcomingEcheancesStr = ""
  try {
    const echeanceService = new EcheanceService(supabase)
    const echeances = await echeanceService.getUpcoming(userId, 7)
    if (echeances.length > 0) {
      upcomingEcheancesStr = echeances
        .map(
          (e) =>
            `- ${e.subject}: "${e.title}" (${e.echeance_type}) — à rendre le ${new Date(e.due_date).toLocaleDateString("fr-FR")}`
        )
        .join("\n")
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch upcoming echeances")
  }

  const enrichedOnboarding = {
    ...(onboardingData as Record<string, unknown> | null),
    daysSinceLastRevision: Array.from(daysSinceLastRevision.entries()),
  }

  const graph = createPlanningGraph(modelOverrides)

  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData: enrichedOnboarding,
    coefficientTable,
    weeklyStats,
    upcomingEcheances: upcomingEcheancesStr,
    extractedTimetableMarkdown,
    isValidTimetable,
    studentProfileContext,
    extractedTimetable,
    preplannerConstraints: "",
    planningValidation: null,
    subjectCoefficients: coefficientTable, // keep for backward compatibility
  })

  // Post-graph validation
  if (state.isValidTimetable && state.extractedTimetable) {
    try {
      const subjects = extractSubjects(state.extractedTimetable)
      const allowedSubjects = subjects.map((s) => s.name)
      const onboarding = onboardingData as OnboardingForm
      const validation = validatePlanning(
        state.generatedPlanning,
        allowedSubjects,
        onboarding?.bedtime || "22:00",
        onboarding?.blockedSlots || []
      )
      state.planningValidation = validation
      state.generatedPlanning = validation.validatedPlanning
    } catch (err) {
      logger.error({ err }, "Failed to run post-graph planning validation")
    }
  }

  // Save cache if modified
  const timetableSerialized = state.extractedTimetable ? JSON.stringify(state.extractedTimetable) : ""
  const originalSerialized = extractedTimetable ? JSON.stringify(extractedTimetable) : ""
  const isTimetableChanged = state.extractedTimetable !== null && timetableSerialized !== originalSerialized

  if (isTimetableChanged || state.studentProfileContext !== studentProfileContext) {
    const newTimetable = isTimetableChanged ? timetableSerialized : undefined
    const newValid = isTimetableChanged ? state.isValidTimetable : undefined
    const newContext = state.studentProfileContext !== studentProfileContext ? state.studentProfileContext : undefined
    await profileService.saveAnalysisCache(userId, newTimetable, newValid, newContext)
  }

  return state
}
