import { createClient } from "@/src/lib/supabase/server"
import { CoefficientService } from "@/src/services/coefficient.service"
import { createPlanningGraph } from "./graph"
import type { PlanningGraphState } from "./state"
import type { ModelOverrides } from "./providers"

export type PlanningWorkflowResult = PlanningGraphState

function getClassNameFromSerie(serie: string): string {
  if (serie === "L'") return "Terminale L'1"
  return `Terminale ${serie}`
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
      const supabase = await createClient()
      const coeffService = new CoefficientService(supabase)
      const coeffs = await coeffService.getCoefficientsByClassName(className)
      
      if (coeffs.length > 0) {
        subjectCoefficientsStr = coeffs
          .map((c) => `${c.subject} (coefficient ${c.coefficient})`)
          .join(", ")
      }
    }
  } catch (err) {
    console.error("Failed to fetch coefficients for AI workflow:", err)
  }

  const graph = createPlanningGraph(modelOverrides)
  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
    subjectCoefficients: subjectCoefficientsStr,
  })

  return state
}
