export type SubjectType = "scientific" | "literary" | "language" | "other"
export type AcademicPeriod = "debut_trimestre" | "milieu_trimestre" | "pre_exam" | "post_exam"
export type PerformanceLevel = "strong" | "neutral" | "weak" | "critical"

export const PLANNING_CONFIG = {
  // Priority scoring
  priorityAlpha: 3,

  // Session duration limits
  maxSessionMinutes: 45,
  minSessionMinutes: 25,

  // Per-subject weekly budget bounds
  minWeeklyMinutesPerSubject: 25,
  maxWeeklyMinutesPerSubject: 120,

  // Break rules
  mandatoryBreakAfterClassMinutes: 30,
  shortBufferBeforeBlockedSlot: 15,
  maxEndTimeAfterEveningClass: "21:00",
  bufferAfterBlockedSlotMinutes: 20,
  betweenSessionBreakMinutes: 10,

  // Free day time windows
  freeDayStartTime: "09:00",
  sundayStartTime: "10:00",
  lunchBreakStart: "12:30",
  lunchBreakEnd: "14:00",
  schoolDayLunchBreakEnd: "14:00",
  schoolDayLunchBreakMorningCutoff: "13:30",
  maxSessionsPerFreeDay: 5,
  maxSessionsPerSchoolDay: 3,

  // Subjects excluded from revision scheduling
  subjectExclusionList: ["Développement Personnel", "DEV-PERSO"],

  // Review vs TD split ratios by subject type
  reviewTdRatios: {
    scientific: { review: 0.35, td: 0.65 },
    literary: { review: 0.7, td: 0.3 },
    language: { review: 0.5, td: 0.5 },
    other: { review: 0.6, td: 0.4 },
  } as Record<SubjectType, { review: number; td: number }>,

  // Period of year budget multipliers
  periodMultipliers: {
    debut_trimestre: 0.8,
    milieu_trimestre: 1.0,
    pre_exam: 1.4,
    post_exam: 0.6,
  } as Record<AcademicPeriod, number>,

  // Performance multipliers for priority scoring
  performanceMultipliers: {
    strong: 0.8,
    neutral: 1.0,
    weak: 1.3,
    critical: 1.5,
  } as Record<PerformanceLevel, number>,
} as const
