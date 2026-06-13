import { ChatPromptTemplate } from "@langchain/core/prompts"
import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, visionAgentOutputSchema } from "../state"
import type { ModelProviderConfig } from "../providers"
import { withRetry } from "./withRetry"
import { ExtractedTimetable } from "@/src/types/planning.types"

function toBase64Image(image: Buffer | string, mimeType = "image/jpeg"): string {
  if (Buffer.isBuffer(image)) {
    return `data:${mimeType};base64,${image.toString("base64")}`
  }

  if (image.startsWith("data:image/")) {
    return image
  }

  return `data:image/jpeg;base64,${image}`
}

export function timetableToMarkdown(timetable: ExtractedTimetable): string {
  if (!timetable || !timetable.days) return ""
  const daysInFrench: Record<string, string> = {
    monday: "LUNDI",
    tuesday: "MARDI",
    wednesday: "MERCREDI",
    thursday: "JEUDI",
    friday: "VENDREDI",
    saturday: "SAMEDI",
    sunday: "DIMANCHE",
  }
  return timetable.days
    .map(d => {
      const dayName = daysInFrench[d.day.toLowerCase()] || d.day.toUpperCase()
      const slotsStr = d.slots
        .map(s => `  - ${s.start}-${s.end} : ${s.subject}`)
        .join("\n")
      return `  ${dayName} :\n${slotsStr}`
    })
    .join("\n")
}

export async function visionAgent(
  state: PlanningGraphAnnotationState,
  modelOverrides?: Partial<ModelProviderConfig>
): Promise<PlanningGraphAnnotationUpdate> {
  if (state.extractedTimetable) {
    logger.info({ valid: state.isValidTimetable }, "[Skip] VISION")
    return {
      extractedTimetable: state.extractedTimetable,
      extractedTimetableMarkdown: state.extractedTimetableMarkdown,
      isValidTimetable: state.isValidTimetable,
      validationErrorMessage: state.validationErrorMessage,
    }
  }

  const model = getModel("vision", modelOverrides)
  const structuredModel = model.withStructuredOutput(visionAgentOutputSchema, {
    name: "validate_and_extract_senegalese_timetable",
  })

  const onboarding = state.onboardingData as Record<string, unknown> | null
  const filiere = (onboarding?.serie as string) || "S1"
  const coefficientTableStr = state.coefficientTable || "No coefficient table provided."

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      [
        "Role: Vision Agent. Extract the school timetable from the image as structured JSON.",
        "",
        "COEFFICIENT TABLE (allowed subject codes and coefficients for this student's filière):",
        coefficientTableStr,
        "",
        "INSTRUCTIONS:",
        "1. For each time slot in the image, extract: start time (HH:MM), end time (HH:MM), subject.",
        "2. STRICTOR MAPPING: Map identified subjects to one of the strict subject codes in the coefficient table above.",
        "   Examples in the image:",
        "   - \"Maths\" or \"Mathématiques\" or \"Algèbre\" → \"MATH\"",
        "   - \"PC\" or \"Physique-Chimie\" or \"Physique\" or \"Chimie\" → \"PC\"",
        "   - \"SVT\" or \"Sciences de la Vie et de la Terre\" or \"Bio\" → \"SVT\"",
        "   - \"Français\" or \"Fr\" or \"Lecture\" → \"FR\"",
        "   - \"Hist-Géo\" or \"HG\" or \"Histoire\" or \"Géographie\" → \"HG\"",
        "   - \"Anglais\" or \"Ang\" or \"English\" → \"ANG\"",
        "   - \"Philo\" or \"Philosophie\" → \"PHILO\"",
        "   - \"Espagnol\" or \"Esp\" or \"Spanish\" → \"ESP\"",
        "   - \"Économie\" or \"Economie\" or \"Eco\" → \"ECO\"",
        "   - \"TQG\" or \"Techniques Quantitatives\" → \"TQG\"",
        "   - \"Civique\" or \"Instruction Civique\" → \"CIV\"",
        "   - \"EPS\" or \"Sport\" or \"Gym\" → \"EPS\"",
        "3. Set the parsed slot's subject to the strict uppercase code (e.g. \"MATH\", \"PC\").",
        "4. For each subject, look up its coefficient from the table. Set null if not found.",
        "5. Classify each subject: scientific | literary | language | other.",
        "6. Only include weekdays (monday–friday). No weekend entries.",
        `7. Set filiere to "${filiere}".`,
        "",
        "VALIDATION (set isValid = false if):",
        "- Classes on Sunday",
        "- Same subject > 3h consecutive without break",
        "- Hours outside 08:00–19:00",
        "- Non-secondary subjects detected",
        "- Document is not a school timetable",
      ].join("\n"),
    ],
    [
      "human",
      [
        {
          type: "text",
          text: "Analyse cette image et extrais l'emploi du temps complet sous forme de JSON structuré.",
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

  const isValid = result.isValid
  const extractedTimetable = isValid ? result.timetable : null
  const extractedTimetableMarkdown = extractedTimetable ? timetableToMarkdown(extractedTimetable) : ""

  return {
    extractedTimetable,
    extractedTimetableMarkdown,
    isValidTimetable: isValid,
    validationErrorMessage: isValid
      ? undefined
      : "Emploi du temps invalide ou non conforme au système sénégalais.",
  }
}
