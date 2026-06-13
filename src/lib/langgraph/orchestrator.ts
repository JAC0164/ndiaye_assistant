import { SupabaseClient } from "@supabase/supabase-js"
import { CoefficientService } from "@/src/services/coefficient.service"
import { EcheanceService } from "@/src/services/echeance.service"
import { HistoriqueService } from "@/src/services/historique.service"
import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"
import { createPlanningGraph } from "./graph"
import type { OnboardingForm } from "@/src/types/planning.types"
import type { PlanningGraphState } from "./state"
import type { ModelOverrides } from "./providers"

export type PlanningWorkflowResult = PlanningGraphState

const COEFFICIENTS_CACHE_TTL = Number(process.env.COEFFICIENTS_CACHE_TTL ?? 3_600_000)
const COEFFICIENTS_CACHE_MAX = 50
const coefficientsCache = new Map<string, { data: string; expiry: number; order: number }>()
let cacheOrderCounter = 0

function getClassNameFromSerie(serie: string): string {
  if (serie === "L'") return "Terminale L'1"
  return `Terminale ${serie}`
}

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
    if (oldestKey) coefficientsCache.delete(oldestKey)
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
  let extractedTimetable = ""
  let isValidTimetable = true
  let studentProfileContext = ""
  let subjectCoefficientsStr = ""
  let weeklyStats = ""

  const profileService = new ProfileService(supabase)
  const cached = await profileService.getCachedAnalysis(userId)
  if (cached) {
    extractedTimetable = cached.extractedTimetableMarkdown
    isValidTimetable = cached.isValidTimetable
    studentProfileContext = cached.studentProfileContext
    logger.info(
      {
        timetableLength: extractedTimetable.length,
        valid: isValidTimetable,
        profileLength: studentProfileContext.length,
      },
      "[Cache] Restored cached analysis"
    )
  }

  try {
    const data = onboardingData as OnboardingForm
    if (data && typeof data.serie === "string") {
      const className = getClassNameFromSerie(data.serie)
      const cachedStr = getCachedCoefficients(className)
      if (cachedStr) {
        subjectCoefficientsStr = cachedStr
      } else {
        const coeffService = new CoefficientService(supabase)
        const coeffs = await coeffService.getCoefficientsByClassName(className)
        if (coeffs.length > 0) {
          subjectCoefficientsStr = coeffs.map((c) => `${c.subject} (coefficient ${c.coefficient})`).join(", ")
          setCachedCoefficients(className, subjectCoefficientsStr)
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch coefficients for AI workflow:", err)
  }

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
    console.error("Failed to fetch weekly stats:", err)
  }

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
    console.error("Failed to fetch upcoming echeances:", err)
  }

  const graph = createPlanningGraph(modelOverrides)

  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
    subjectCoefficients: subjectCoefficientsStr,
    weeklyStats,
    upcomingEcheances: upcomingEcheancesStr,
    extractedTimetableMarkdown: extractedTimetable,
    isValidTimetable,
    studentProfileContext,
  })

  if (
    state.extractedTimetableMarkdown !== extractedTimetable ||
    state.studentProfileContext !== studentProfileContext
  ) {
    const newTimetable =
      state.extractedTimetableMarkdown !== extractedTimetable ? state.extractedTimetableMarkdown : undefined
    const newValid = state.extractedTimetableMarkdown !== extractedTimetable ? state.isValidTimetable : undefined
    const newContext = state.studentProfileContext !== studentProfileContext ? state.studentProfileContext : undefined
    await profileService.saveAnalysisCache(userId, newTimetable, newValid, newContext)
  }

  return state
}
