import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  profileAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"

export async function profileAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  const model = getModel("profile", modelOverrides)
  const structuredModel = model.withStructuredOutput(profileAgentOutputSchema, {
    name: "analyze_student_learning_profile",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Tu es l'agent Profil de Ndiaye.",
        "Analyse uniquement les données d'onboarding fournies.",
        "Identifie les matières en souffrance en tenant compte des coefficients officiels déjà présents dans les données.",
        "Déduis les contraintes cognitives, de transport, de fatigue et de disponibilité.",
        "Formule des priorités textuelles claires pour le planificateur sans inventer de coefficients, de règles ou de matières absentes.",
      ].join(" "),
    ],
    [
      "human",
      "Données d'onboarding typées: {onboardingDataJson}",
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await chain.invoke({
    onboardingDataJson: JSON.stringify(state.onboardingData),
  })

  return {
    studentProfileContext: result.studentProfileContext,
  }
}
