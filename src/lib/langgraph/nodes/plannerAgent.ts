import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  plannerAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"

export async function plannerAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  if (
    process.env.STOP_AT_AGENT === "vision" ||
    process.env.STOP_AT_AGENT === "profile"
  ) {
    console.log(
      `\x1b[33m[Stop] PLANNER  | Halted because STOP_AT_AGENT="${process.env.STOP_AT_AGENT}".\x1b[0m`
    )
    return {
      generatedPlanning: [],
    }
  }

  const model = getModel("planner", modelOverrides)
  const structuredModel = model.withStructuredOutput(plannerAgentOutputSchema, {
    name: "generate_weekly_study_sessions",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Rôle: Agent Planificateur. Construit gabarit hebdomadaire cyclique 7 jours (séances révision 45 minutes).",
        "",
        "Règles strictes :",
        "1. Interdit: Ne pas recopier les cours de l'emploi du temps (sert uniquement à repérer les créneaux libres).",
        "2. Interdit: Ne rien planifier pendant les indisponibilités (blockedSlots) ou après le couvre-feu (bedtime) définis dans le profil.",
        "3. Type séance: Uniquement des séances d'étude personnelle avec session_type = 'review'.",
        "4. Règles Ndiaye: Révisions J-1 (matières du lendemain), alternance sciences/humanités, pas de surcharge après transport, pause dimanche après-midi, sur-prioriser matières faibles (weakSubjects).",
        "5. Format: Heures en HH:mm, jours en anglais (monday, tuesday, wednesday, thursday, friday, saturday, sunday).",
      ].join("\n"),
    ],
    [
      "human",
      [
        "Emploi du temps extrait:",
        "{extractedTimetableMarkdown}",
        "",
        "Contexte profil élève:",
        "{studentProfileContext}",
      ].join("\n"),
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await chain.invoke(
    {
      extractedTimetableMarkdown: state.extractedTimetableMarkdown,
      studentProfileContext: state.studentProfileContext,
    },
    createTokenLogger("planner")
  )

  return {
    generatedPlanning: result.sessions,
  }
}
