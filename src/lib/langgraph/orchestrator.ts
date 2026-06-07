import { createClient } from "@/src/lib/supabase/server"
import { CoefficientService } from "@/src/services/coefficient.service"
import { createPlanningGraph } from "./graph"
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
  if (entry && Date.now() < entry.expiry) {
    return entry.data
  }
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
  imageBuffer: Buffer,
  onboardingData: unknown,
  imageMimeType = "image/jpeg",
  modelOverrides?: ModelOverrides
): Promise<PlanningWorkflowResult> {
  let subjectCoefficientsStr = ""

  try {
    const data = onboardingData as Record<string, any>
    if (data && typeof data.serie === "string") {
      const className = getClassNameFromSerie(data.serie)
      const cached = getCachedCoefficients(className)
      if (cached) {
        subjectCoefficientsStr = cached
      } else {
        const supabase = await createClient()
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

  if (!compiledGraph) {
    compiledGraph = createPlanningGraph()
  }

  const graph = modelOverrides ? createPlanningGraph(modelOverrides) : compiledGraph
  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
    subjectCoefficients: subjectCoefficientsStr,
  })

  return state
}
