import { ChatPromptTemplate } from "@langchain/core/prompts"
import { getModel, createTokenLogger } from "../model"
import { logger } from "@/src/lib/logger"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate, visionAgentOutputSchema } from "../state"
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

export function validateExtractedTimetable(timetable: ExtractedTimetable): { isValid: boolean; errorMessage?: string } {
  if (!timetable.days) return { isValid: false, errorMessage: "No slots extracted." }
  for (const day of timetable.days) {
    for (const slot of day.slots) {
      if (slot.start < "08:00" || slot.end > "19:00") {
        return { isValid: false, errorMessage: "Slot outside allowed hours (08:00–19:00)." }
      }
    }
  }

  for (const day of timetable.days) {
    const sortedSlots = [...day.slots].sort((a, b) => {
      const [ah, am] = a.start.split(":").map(Number)
      const [bh, bm] = b.start.split(":").map(Number)
      return ah * 60 + am - (bh * 60 + bm)
    })

    let currentSubject = ""
    let currentDuration = 0
    let lastEndMin = -1

    for (const slot of sortedSlots) {
      const [sh, sm] = slot.start.split(":").map(Number)
      const [eh, em] = slot.end.split(":").map(Number)
      const startMin = sh * 60 + sm
      const endMin = eh * 60 + em
      const duration = endMin - startMin

      if (slot.subject === currentSubject && lastEndMin !== -1 && startMin - lastEndMin <= 20) {
        currentDuration += duration
      } else {
        currentSubject = slot.subject
        currentDuration = duration
      }

      lastEndMin = endMin

      if (currentDuration > 180) {
        return { isValid: false, errorMessage: `Same subject for more than 3 consecutive hours: ${currentSubject}.` }
      }
    }
  }

  if (timetable.days.length === 0 || timetable.days.every((d) => d.slots.length === 0)) {
    return { isValid: false, errorMessage: "No slots extracted." }
  }

  return { isValid: true }
}

export function timetableToMarkdown(timetable: ExtractedTimetable): string {
  if (!timetable || !timetable.days) return ""
  const dayAbbr: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  }
  return timetable.days
    .map((d) => {
      const day = dayAbbr[d.day.toLowerCase()] || d.day.slice(0, 3)
      const slots = d.slots.map((s) => `${s.start}-${s.end}(${s.subject})`).join(", ")
      return `${day}: ${slots}`
    })
    .join("\n")
}

export async function visionAgent(state: PlanningGraphAnnotationState): Promise<PlanningGraphAnnotationUpdate> {
  // If we already have a valid extracted timetable in the state (e.g. from cache), skip the vision agent
  if (state.extractedTimetable) {
    logger.info({ valid: state.isValidTimetable }, "[Skip] VISION")
    return {
      extractedTimetable: state.extractedTimetable,
      timetableSummary: state.timetableSummary,
      isValidTimetable: state.isValidTimetable,
      validationErrorMessage: state.validationErrorMessage,
    }
  }

  const model = getModel("vision")
  const structuredModel = model.withStructuredOutput(visionAgentOutputSchema, {
    name: "validate_and_extract_senegalese_timetable",
  })

  const onboarding = state.onboardingData as Record<string, unknown> | null
  const coeffTable = state.coefficientTable || ""

  const systemParts = [
    "Role: Vision Agent. Extract the school timetable from the image as structured JSON.",
    "",
    ...(coeffTable ? ["COEFFICIENT TABLE (allowed subject codes and coefficients):", coeffTable, ""] : []),
    "INSTRUCTIONS:",
    "1. For each time slot in the image, extract: start time (HH:MM), end time (HH:MM), subject.",
    ...(coeffTable
      ? [
          "2. STRICTOR MAPPING: Map identified subjects to one of the strict subject codes in the coefficient table above.",
        ]
      : ["2. Map subjects to standard codes (MATH, FR, PC, SVT, HG, ANG, ESP, PHILO, ECO, TQG, CIV, EPS)."]),
    "   Examples in the image:",
    '   - "Maths" or "Mathématiques" or "Algèbre" → "MATH"',
    '   - "PC" or "Physique-Chimie" or "Physique" or "Chimie" → "PC"',
    '   - "SVT" or "Sciences de la Vie et de la Terre" or "Bio" → "SVT"',
    '   - "Français" or "Fr" or "Lecture" → "FR"',
    '   - "Hist-Géo" or "HG" or "Histoire" or "Géographie" → "HG"',
    '   - "Anglais" or "Ang" or "English" → "ANG"',
    '   - "Philo" or "Philosophie" → "PHILO"',
    '   - "Espagnol" or "Esp" or "Spanish" → "ESP"',
    '   - "Économie" or "Economie" or "Eco" → "ECO"',
    '   - "TQG" or "Techniques Quantitatives" → "TQG"',
    '   - "Civique" or "Instruction Civique" → "CIV"',
    '   - "EPS" or "Sport" or "Gym" → "EPS"',
    '3. Set the parsed slot\'s subject to the strict uppercase code (e.g. "MATH", "PC").',
    ...(coeffTable
      ? ["4. For each subject, look up its coefficient from the table. Set null if not found."]
      : ["4. Set coefficient to null for all subjects."]),
    "5. Classify each subject: scientific | literary | language | other.",
    "6. Only include weekdays (monday–friday). No weekend entries.",
  ]

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemParts.join("\n")],
    [
      "human",
      [
        {
          type: "text",
          text: "Analyze this image and extract the complete timetable as structured JSON.",
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

  const extractedTimetable = result.timetable
  const validation = extractedTimetable
    ? validateExtractedTimetable(extractedTimetable)
    : { isValid: false, errorMessage: "Failed to extract the timetable." }

  return {
    extractedTimetable: validation.isValid ? extractedTimetable : null,
    timetableSummary: validation.isValid ? timetableToMarkdown(extractedTimetable!) : "",
    isValidTimetable: validation.isValid,
    validationErrorMessage: validation.isValid ? undefined : validation.errorMessage,
  }
}
