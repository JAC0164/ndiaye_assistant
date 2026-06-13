import { GeneratedSeance } from "@/src/lib/langgraph/state"

export interface BlockedSlot {
  id: string
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  startTime: string
  endTime: string
  reason: string
}

export interface OnboardingForm {
  weakSubjects: string[]
  bedtime: string
  blockedSlots: BlockedSlot[]
}

export interface ProfileMetadata {
  serie?: string
  weakSubjects?: string[]
  bedtime?: string
  blockedSlots?: BlockedSlot[]
  cachedExtractedTimetable?: string
  cachedTimetableValid?: boolean
  cachedProfileContext?: string
}

import type { SubjectType } from "@/src/lib/planning/planningConfig"

// --- Vision node structured output (replaces markdown) ---

export interface TimetableSlot {
  start: string // "HH:MM"
  end: string // "HH:MM"
  subject: string // normalized to official DB name
  coefficient: number | null // from DB table; null = unmatched
  subject_type: SubjectType
}

export interface TimetableDay {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday"
  slots: TimetableSlot[]
}

export interface ExtractedTimetable {
  filiere: string
  days: TimetableDay[]
}

// --- Pre-planner engine outputs ---

export interface SubjectInfo {
  name: string
  coefficient: number // fallback to 1 if null in timetable
  subjectType: SubjectType
  daysPresent: string[] // weekdays where this subject has class
}

export interface SubjectBudget {
  totalMinutes: number
  reviewMinutes: number
  tdMinutes: number
}

export interface FreeSlot {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  start: string // "HH:MM"
  end: string // "HH:MM"
  durationMinutes: number
}

// --- Post-validator output ---

export interface ValidationError {
  check: string
  severity: "error" | "warning"
  message: string
  session?: GeneratedSeance
}

export interface ValidationResult {
  validatedPlanning: GeneratedSeance[]
  wasRepaired: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  removedSessions: GeneratedSeance[]
}

export type ApiResponse = {
  isValidTimetable: boolean
  extractedTimetableMarkdown?: string // kept for backward compat / display
  extractedTimetable?: ExtractedTimetable // new structured format
  studentProfileContext?: string
  generatedPlanning: GeneratedSeance[]
  validationErrorMessage?: string
  planningValidation?: ValidationResult // new
}
