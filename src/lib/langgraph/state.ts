import { Annotation } from "@langchain/langgraph"
import { z } from "zod"
import type { ExtractedTimetable, ValidationResult } from "@/src/types/planning.types"

export const dayOfWeekSchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])

export const sessionTypeSchema = z.enum(["td", "review", "break"])

export const generatedSeanceSchema = z.object({
  day_of_week: dayOfWeekSchema.describe("Jour de la semaine cyclique."),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe("Heure locale de début au format HH:mm."),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe("Heure locale de fin au format HH:mm."),
  subject: z.string().min(1).describe("Matière officielle ou activité."),
  session_type: sessionTypeSchema.describe("Type de séance."),
  pedagogical_note: z.string().describe("Note pédagogique courte pour guider la séance."),
})

export const subjectTypeSchema = z.enum(["scientific", "literary", "language", "other"])

export const timetableSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  subject: z.string().min(1),
  coefficient: z.number().nullable(),
  subject_type: subjectTypeSchema,
})

export const timetableDaySchema = z.object({
  day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]),
  slots: z.array(timetableSlotSchema),
})

export const extractedTimetableSchema = z.object({
  filiere: z.string(),
  days: z.array(timetableDaySchema),
})

export const visionAgentOutputSchema = z.object({
  isValid: z.boolean(),
  timetable: extractedTimetableSchema,
})

export const profileAgentOutputSchema = z.object({
  studentProfileContext: z.string(),
})

export const plannerAgentOutputSchema = z.object({
  sessions: z.array(generatedSeanceSchema),
})

export type GeneratedSeance = z.infer<typeof generatedSeanceSchema>

export interface PlanningGraphState {
  timetableImage: Buffer | string
  timetableImageMimeType: string
  onboardingData: unknown
  extractedTimetableMarkdown: string
  studentProfileContext: string
  subjectCoefficients: string
  weeklyStats: string
  upcomingEcheances: string
  isValidTimetable: boolean
  validationErrorMessage?: string
  generatedPlanning: GeneratedSeance[]
  extractedTimetable: ExtractedTimetable | null
  coefficientTable: string
  preplannerConstraints: string
  planningValidation: ValidationResult | null
  ressentBySubject: Record<string, number>
  dureeReelleBySubject: Record<string, number>
}

export const PlanningGraphAnnotation = Annotation.Root({
  timetableImage: Annotation<Buffer | string>(),
  timetableImageMimeType: Annotation<string>({
    reducer: (_current, update) => update ?? _current,
    default: () => "image/jpeg",
  }),
  onboardingData: Annotation<unknown>(),
  extractedTimetableMarkdown: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  studentProfileContext: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  subjectCoefficients: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  weeklyStats: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  upcomingEcheances: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  isValidTimetable: Annotation<boolean>({
    value: (_current, update) => update,
    default: () => true,
  }),
  validationErrorMessage: Annotation<string | undefined>({
    value: (_current, update) => update,
    default: () => undefined,
  }),
  generatedPlanning: Annotation<GeneratedSeance[]>({
    value: (_current, update) => update,
    default: () => [] satisfies GeneratedSeance[],
  }),
  extractedTimetable: Annotation<ExtractedTimetable | null>({
    value: (_current, update) => update,
    default: () => null,
  }),
  coefficientTable: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  preplannerConstraints: Annotation<string>({
    value: (_current, update) => update,
    default: () => "",
  }),
  planningValidation: Annotation<ValidationResult | null>({
    value: (_current, update) => update,
    default: () => null,
  }),
  ressentBySubject: Annotation<Record<string, number>>({
    value: (_current, update) => update,
    default: () => ({}),
  }),
  dureeReelleBySubject: Annotation<Record<string, number>>({
    value: (_current, update) => update,
    default: () => ({}),
  }),
})

export type PlanningGraphAnnotationState = typeof PlanningGraphAnnotation.State

export type PlanningGraphAnnotationUpdate = typeof PlanningGraphAnnotation.Update
