import { ChatPromptTemplate } from "@langchain/core/prompts"

import { createGeminiFlashModel } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  plannerAgentOutputSchema,
} from "../state"

export async function plannerAgent(
  state: PlanningGraphAnnotationState
): Promise<PlanningGraphAnnotationUpdate> {
  if (!state.isValidTimetable) {
    return {
      generatedPlanning: [],
    }
  }

  const model = createGeminiFlashModel()
  const structuredModel = model.withStructuredOutput(plannerAgentOutputSchema, {
    name: "generate_weekly_study_sessions",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Tu es l'agent Planificateur de Ndiaye.",
        "Construis un gabarit hebdomadaire cyclique de 7 jours avec des séances de révision de 45 minutes.",
        "Ne recopie jamais les créneaux de cours de l'emploi du temps comme résultat final: ils servent uniquement à trouver les moments libres et les révisions J-1.",
        "Toutes les sorties doivent être des séances d'étude personnelles avec session_type égal à review.",
        "Respecte strictement les règles Ndiaye: antécédence J-1 avant les cours, alerte composition quand elle est présente dans le contexte, alternance sciences/humanités, pas de surcharge après transport long, pause le dimanche après-midi.",
        "Ne crée pas de lignes quotidiennes datées. Retourne uniquement des séances hebdomadaires prêtes pour la table sessions.",
        "Chaque séance doit durer exactement 45 minutes.",
        "Les horaires doivent être au format HH:mm et les jours en anglais selon l'enum PostgreSQL.",
      ].join(" "),
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
  const result = await chain.invoke({
    extractedTimetableMarkdown: state.extractedTimetableMarkdown,
    studentProfileContext: state.studentProfileContext,
  })

  return {
    generatedPlanning: result.sessions,
  }
}
