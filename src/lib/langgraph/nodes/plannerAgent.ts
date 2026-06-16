import { ChatPromptTemplate } from "@langchain/core/prompts"
import { getModel, createTokenLogger } from "../model"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, plannerAgentOutputSchema } from "../state"
import { withRetry } from "./withRetry"
import { buildPlannerSystemPrompt, PLANNER_HUMAN_TEMPLATE } from "../prompts"

export async function plannerAgent(state: PlanningGraphAnnotationState): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  const model = getModel("planner")
  const structuredModel = model.withStructuredOutput(plannerAgentOutputSchema, {
    name: "generate_weekly_study_sessions",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", buildPlannerSystemPrompt()],
    ["human", PLANNER_HUMAN_TEMPLATE],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await withRetry(
    () =>
      chain.invoke(
        {
          studentProfileContext: state.studentProfileContext,
          timetableSummary: state.timetableSummary,
          preplannerConstraints: state.preplannerConstraints || "",
          draftPlanning: JSON.stringify(state.draftPlanning || [], null, 2),
        },
        createTokenLogger("planner")
      ),
    "planner"
  )

  return {
    generatedPlanning: result.sessions,
  }
}
