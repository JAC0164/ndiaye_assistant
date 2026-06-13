import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, visionAgentOutputSchema } from "../state"
import type { ModelProviderConfig } from "../providers"
import { withRetry } from "./withRetry"

function toBase64Image(image: Buffer | string, mimeType = "image/jpeg"): string {
  if (Buffer.isBuffer(image)) {
    return `data:${mimeType};base64,${image.toString("base64")}`
  }

  if (image.startsWith("data:image/")) {
    return image
  }

  return `data:image/jpeg;base64,${image}`
}

export async function visionAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (state.extractedTimetableMarkdown) {
    logger.info({ length: state.extractedTimetableMarkdown.length, valid: state.isValidTimetable }, "[Skip] VISION")
    return {
      extractedTimetableMarkdown: state.extractedTimetableMarkdown,
      isValidTimetable: state.isValidTimetable,
      validationErrorMessage: state.validationErrorMessage,
    }
  }

  const model = getModel("vision", modelOverrides)
  const structuredModel = model.withStructuredOutput(visionAgentOutputSchema, {
    name: "validate_and_extract_senegalese_timetable",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Rôle: Agent Vision. Extrait et valide l'emploi du temps secondaire Sénégal.",
        "Format de sortie :",
        "- `timetableMarkdown` : une liste chronologique explicite jour par jour, pas de tableau Markdown.",
        "- Format attendu :",
        "  LUNDI :",
        "  - 08:00-09:30 : Développement Personnel",
        "  - 09:40-11:10 : Mathématiques",
        "  - 11:20-12:50 : Français",
        "  MARDI :",
        "  - ...",
        "- Garde uniquement le nom de la matière. Supprime les noms de professeurs et les numéros de salle.",
        "- N'inclus PAS les créneaux vides.",
        "- Pas de titre, pas d'intro, pas de notes additionnelles.",
        "",
        "Validation Sénégal (si anomalie, `isValid = false`) :",
        "Rejeter si :",
        "- Cours le dimanche.",
        "- Cours d'une même matière > 3h consécutives sans pause.",
        "- Horaires hors 08:00 - 19:00.",
        "- Matières hors secondaire (Valides: Maths, PC, SVT, Français, Anglais, Histoire-Géo, Philo, EPS, Allemand, Espagnol, Arabe, etc.)",
        "- Document autre qu'un emploi du temps de classe.",
      ].join("\n"),
    ],
    [
      "human",
      [
        {
          type: "text",
          text: "Analyse cette image et extrais l'emploi du temps complet sous forme de liste chronologique jour par jour.",
        },
        {
          type: "image_url",
          image_url: {
            url: "{imageDataUrl}",
          },
        },
      ],
    ],
  ])

  const chain = prompt.pipe(structuredModel)
  const result = await withRetry(
    () =>
      chain.invoke(
        {
          imageDataUrl: toBase64Image(state.timetableImage, state.timetableImageMimeType),
        },
        createTokenLogger("vision")
      ),
    "vision"
  )

  return {
    extractedTimetableMarkdown: result.timetableMarkdown,
    isValidTimetable: result.isValid,
    validationErrorMessage: result.isValid
      ? undefined
      : "Emploi du temps invalide ou non conforme au système sénégalais.",
  }
}
