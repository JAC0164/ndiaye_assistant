import { createPlanningGraph } from "./graph"
import type { PlanningGraphState } from "./state"
import type { ModelOverrides } from "./providers"

export type PlanningWorkflowResult = PlanningGraphState

export async function runPlanningWorkflow(
  imageBuffer: Buffer,
  onboardingData: unknown,
  imageMimeType = "image/jpeg",
  modelOverrides?: ModelOverrides
): Promise<PlanningWorkflowResult> {
  const graph = createPlanningGraph(modelOverrides)
  const state = await graph.invoke({
    timetableImage: imageBuffer,
    timetableImageMimeType: imageMimeType,
    onboardingData,
  })

  return state
}
