import { ChatPromptTemplate } from "@langchain/core/prompts"

import { getModel, createTokenLogger } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  visionAgentOutputSchema,
} from "../state"
import type { ModelProviderConfig } from "../providers"

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
    console.log("\x1b[33m[Skip] VISION   | Output already present in state, skipping LLM call.\x1b[0m")
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
        "- `timetableMarkdown` doit contenir UNIQUEMENT le tableau markdown complet des cours (aucune omission, extrait chaque cellule/créneau).",
        "- Dans le tableau, garde uniquement le nom de la matière. Supprime les noms de professeurs (ex: M. Diop, Mme Ndiaye) et les numéros de salle (ex: Salle 5).",
        "- Pas de titre, pas d'intro, pas de notes.",
        "",
        "Validation Sénégal (si anomalie, `isValid = false`) :",
        "Rejeter si :",
        "- Cours le dimanche.",
        "- Cours d'une même matière > 3h consécutives sans pause (ex: 08h-12h d'affilée).",
        "- Horaires hors 08:00 - 19:00.",
        "- Matières hors secondaire (Valides: Maths, PC, SVT, Français, Anglais, Histoire-Géo, Philo, EPS, Allemand, Espagnol, Arabe, etc. Rejeter si matières universitaires, pro ou étrangères).",
        "- Document autre qu'un emploi du temps de classe.",
      ].join("\n"),
    ],
    [
      "human",
      [
        {
          type: "text",
          text: "Analyse cette image et extrais l'emploi du temps complet sous forme de tableau Markdown.",
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
  const result = await chain.invoke(
    {
      imageDataUrl: toBase64Image(
        state.timetableImage,
        state.timetableImageMimeType
      ),
    },
    createTokenLogger("vision")
  )

  return {
    extractedTimetableMarkdown: result.timetableMarkdown,
    isValidTimetable: result.isValid,
    validationErrorMessage: result.isValid
      ? undefined
      : "Emploi du temps invalide ou non conforme au système sénégalais.",
  }
}
