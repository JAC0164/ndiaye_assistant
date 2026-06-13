import { GeneratedSeance } from "@/src/lib/langgraph/state"

export interface BlockedSlot {
  id: string
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  startTime: string
  endTime: string
  reason: string
}

export interface OnboardingForm {
  serie: "S1" | "S2" | "L1" | "L2" | "L'"
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

export type ApiResponse = {
  isValidTimetable: boolean
  extractedTimetableMarkdown?: string
  studentProfileContext?: string
  generatedPlanning: GeneratedSeance[]
  validationErrorMessage?: string
}
