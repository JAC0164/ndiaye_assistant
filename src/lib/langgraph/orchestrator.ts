import { SupabaseClient } from "@supabase/supabase-js"
import { CoefficientService } from "@/src/services/coefficient.service"
import { HistoriqueService } from "@/src/services/historique.service"
import { ProfileService } from "@/src/services/profile.service"
import { createPlanningGraph } from "./graph"
import type { OnboardingForm } from "@/src/types/planning.types"
import type { PlanningGraphState } from "./state"
import type { ModelOverrides } from "./providers"

export type PlanningWorkflowResult = PlanningGraphState

const COEFFICIENTS_CACHE_TTL = 3_600_000
const coefficientsCache = new Map<string, { data: string; expiry: number }>()

let compiledGraph: ReturnType<typeof createPlanningGraph> | null = null

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
  coefficientsCache.set(className, {
    data,
    expiry: Date.now() + COEFFICIENTS_CACHE_TTL,
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
    console.log(
      `\x1b[36m[Cache]\x1b[0m timetable=${extractedTimetable.length}c valid=${isValidTimetable} profile=${studentProfileContext.length}c`
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
          subjectCoefficientsStr = coeffs
            .map((c) => `${c.subject} (coefficient ${c.coefficient})`)
            .join(", ")
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
      console.log(`\x1b[36m[Feedback]\x1b[0m ${stats.sessionCount} sessions, ${stats.totalMinutes} min, note=${stats.averageRating}`)
    }
  } catch (err) {
    console.error("Failed to fetch weekly stats:", err)
  }

  if (!compiledGraph) compiledGraph = createPlanningGraph()
  const graph = modelOverrides ? createPlanningGraph(modelOverrides) : compiledGraph

  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
    subjectCoefficients: subjectCoefficientsStr,
    weeklyStats,
    extractedTimetableMarkdown: extractedTimetable,
    isValidTimetable,
    studentProfileContext,
  })

  if (
    state.extractedTimetableMarkdown !== extractedTimetable ||
    state.studentProfileContext !== studentProfileContext
  ) {
    const newTimetable = state.extractedTimetableMarkdown !== extractedTimetable ? state.extractedTimetableMarkdown : undefined
    const newValid = state.extractedTimetableMarkdown !== extractedTimetable ? state.isValidTimetable : undefined
    const newContext = state.studentProfileContext !== studentProfileContext ? state.studentProfileContext : undefined
    await profileService.saveAnalysisCache(userId, newTimetable, newValid, newContext)
  }

  return state
}
