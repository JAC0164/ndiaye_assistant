import { ChatPromptTemplate } from "@langchain/core/prompts"

import { createGeminiFlashModel } from "../model"
import {
  PlanningGraphAnnotationState,
  PlanningGraphAnnotationUpdate,
  visionAgentOutputSchema,
} from "../state"

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
  state: PlanningGraphAnnotationState
): Promise<PlanningGraphAnnotationUpdate> {
  const model = createGeminiFlashModel()
  const structuredModel = model.withStructuredOutput(visionAgentOutputSchema, {
    name: "validate_and_extract_senegalese_timetable",
  })

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Tu es l'agent Vision de Ndiaye.",
        "Analyse l'image d'un emploi du temps scolaire sénégalais.",
        "Extrais les cours dans un Markdown propre avec jours, horaires et matières.",
        "Valide la cohérence avec le système scolaire sénégalais: matières officielles, horaires locaux plausibles, semaine scolaire réaliste.",
        "Si le document n'est pas un emploi du temps exploitable ou semble hors contexte sénégalais, marque isValid à false et explique brièvement.",
      ].join(" "),
    ],
    [
      "human",
      [
        {
          type: "text",
          text: "Analyse cette image d'emploi du temps et retourne uniquement la sortie structurée demandée.",
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
  const result = await chain.invoke({
    imageDataUrl: toBase64Image(
      state.timetableImage,
      state.timetableImageMimeType
    ),
  })

  return {
    extractedTimetableMarkdown: result.timetableMarkdown,
    isValidTimetable: result.isValid,
    validationErrorMessage: result.isValid
      ? undefined
      : result.errorReason ?? "Emploi du temps invalide.",
  }
}
