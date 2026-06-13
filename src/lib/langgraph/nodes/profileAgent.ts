import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  profileAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"
import { withRetry } from "./withRetry"

export async function profileAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (state.studentProfileContext) {
    logger.info({ contextLength: state.studentProfileContext.length }, "[Skip] PROFILE")
    return {
      studentProfileContext: state.studentProfileContext,
    }
  }

  const model = getModel("profile", modelOverrides)
  const structuredModel = model.withStructuredOutput(profileAgentOutputSchema, {
    name: "analyze_student_learning_profile",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Role: Profile Agent. Extract student study priorities and constraints.",
        "Output requirements (in studentProfileContext):",
        "- Simple, extremely telegraphic markdown bullet points in French.",
        "- STRICT: No raw JSON, no ```json blocks.",
        "- Limit output length: keep bullet points short and concise (max 4 bullets, under 100 total tokens).",
        "",
        "Instructions:",
        "1. Weak subjects: List subjects from `weakSubjects` needing extra focus.",
        "2. Curfew: Note bedtime limit; strictly forbid study after this hour.",
        "3. Unavailable slots: List each item from `blockedSlots` (day, hours, reason) and forbid scheduling there.",
        "4. Track: Note focus based on track (S1/S2: science; L1/L2: humanities).",
      ].join("\n"),
    ],
    [
      "human",
      "Onboarding data: {onboardingDataJson}",
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await withRetry(
    () =>
      chain.invoke(
        {
          onboardingDataJson: JSON.stringify(state.onboardingData),
        },
        createTokenLogger("profile")
      ),
    "profile"
  )

  return {
    studentProfileContext: result.studentProfileContext,
  }
}
