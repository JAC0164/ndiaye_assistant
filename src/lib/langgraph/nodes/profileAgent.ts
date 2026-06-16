import { logger } from "@/src/lib/logger"
import type { BlockedSlot } from "@/src/types/planning.types"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate } from "../state"

interface ProfileOnboarding {
  weakSubjects?: string[]
  bedtime?: string
  blockedSlots?: BlockedSlot[]
  class_name?: string
  className?: string
  series_name?: string
  seriesName?: string
  serie?: string
  series?: string
}

export async function profileAgent(state: PlanningGraphAnnotationState): Promise<PlanningGraphAnnotationUpdate> {
  // If we already have a valid student profile context in the state (e.g. from cache), skip the profile agent
  if (state.studentProfileContext) {
    const cachedHasHumanities = state.studentProfileContext.includes("Humanities")
    const cachedHasScience = state.studentProfileContext.includes("Science")
    const classSeriesName = (state.classSeriesName || "").toUpperCase()
    const dbIsHumanities =
      classSeriesName.includes("L1") ||
      classSeriesName.includes("L2") ||
      classSeriesName.includes("L'") ||
      classSeriesName.startsWith("L")
    const dbIsScience =
      classSeriesName.includes("S1") || classSeriesName.includes("S2") || classSeriesName.startsWith("S")

    // If the DB series contradicts the cached profile context, regenerate
    if ((dbIsHumanities && cachedHasScience) || (dbIsScience && cachedHasHumanities)) {
      logger.warn(
        { cachedTrack: cachedHasHumanities ? "Humanities" : "Science", dbTrack: classSeriesName },
        "[Invalidate] Cached profile context contradicts DB series — regenerating"
      )
    } else {
      logger.info({ contextLength: state.studentProfileContext.length }, "[Skip] PROFILE")
      return {
        studentProfileContext: state.studentProfileContext,
      }
    }
  }

  logger.info("[Start] PROFILE (Deterministic)")

  const onboarding = (state.onboardingData || {}) as ProfileOnboarding
  const weakSubjects = Array.isArray(onboarding.weakSubjects) ? onboarding.weakSubjects : []
  const weakSubjectsStr = weakSubjects.length > 0 ? weakSubjects.join(", ") : ""

  const bedtime = onboarding.bedtime

  const formatBedtime = (timeStr: string | undefined) => {
    if (!timeStr) return ""
    if (timeStr.includes(":")) {
      const [h, m] = timeStr.split(":")
      const hour = parseInt(h, 10)
      return `${hour}h${m}`
    }
    return timeStr
  }

  const formatSlotTime = (timeStr: string) => {
    if (!timeStr) return ""
    if (timeStr.includes(":")) {
      const [h, m] = timeStr.split(":")
      const hour = parseInt(h, 10)
      if (m === "00") return `${hour}h`
      return `${hour}h${m}`
    }
    return timeStr
  }

  const bedtimeFormatted = formatBedtime(bedtime)

  const blockedSlots = Array.isArray(onboarding.blockedSlots) ? onboarding.blockedSlots : []
  const dayMap: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  }

  const blockedSlotsStr =
    blockedSlots.length > 0
      ? blockedSlots
          .map((s) => {
            const day = dayMap[s.day?.toLowerCase()] || s.day || ""
            const start = formatSlotTime(s.startTime)
            const end = formatSlotTime(s.endTime)
            const reasonStr = s.reason ? ` (${s.reason})` : ""
            return `${day} ${start}-${end}${reasonStr}`
          })
          .join(", ")
      : ""

  // Track / Piste detection
  const coeffTable = (state.coefficientTable || "").toUpperCase()
  const className = (onboarding.class_name || onboarding.className || "").toUpperCase()
  const seriesName = (onboarding.series_name || onboarding.seriesName || "").toUpperCase()
  const rawSerie = (onboarding.serie || onboarding.series || "").toUpperCase()
  const classSeriesName = (state.classSeriesName || "").toUpperCase()

  // Helper: extract coefficient value for a subject from the coeffTable string
  const extractCoeff = (subject: string): number => {
    const match = coeffTable.match(new RegExp(`${subject}\\s*:\\s*(\\d+)`))
    return match ? parseInt(match[1], 10) : 0
  }

  const frCoeff = extractCoeff("FR")
  const hgCoeff = extractCoeff("HG")
  const philoCoeff = extractCoeff("PHILO")
  const mathCoeff = extractCoeff("MATH")
  const pcCoeff = extractCoeff("PC")
  const svtCoeff = extractCoeff("SVT")

  const humanitiesScore = frCoeff + hgCoeff + philoCoeff
  const scienceScore = mathCoeff + pcCoeff + svtCoeff
  const isHumanitiesByCoeffs = humanitiesScore > 0 && humanitiesScore >= scienceScore

  const isHumanities =
    coeffTable.includes("L1") ||
    coeffTable.includes("L2") ||
    coeffTable.includes("L'") ||
    className.includes("L1") ||
    className.includes("L2") ||
    className.includes("L'") ||
    className.startsWith("L") ||
    seriesName.includes("L1") ||
    seriesName.includes("L2") ||
    seriesName.includes("L'") ||
    seriesName.startsWith("L") ||
    rawSerie.includes("L1") ||
    rawSerie.includes("L2") ||
    rawSerie.includes("L'") ||
    rawSerie.startsWith("L") ||
    classSeriesName.includes("L1") ||
    classSeriesName.includes("L2") ||
    classSeriesName.includes("L'") ||
    classSeriesName.startsWith("L") ||
    isHumanitiesByCoeffs

  const trackStr = isHumanities ? "Humanities (L1/L2 assumed)" : "Science (S1/S2 assumed)"

  const profileLines: string[] = []
  if (weakSubjectsStr) profileLines.push(`- **Weak subjects**: ${weakSubjectsStr} → reinforcement priority`)
  if (bedtimeFormatted) profileLines.push(`- **Curfew**: until ${bedtimeFormatted} max → no study after`)
  if (blockedSlotsStr) profileLines.push(`- **Blocked slots**: ${blockedSlotsStr}`)
  profileLines.push(`- **Track**: ${trackStr}`)
  const studentProfileContext = profileLines.join("\n")

  return {
    studentProfileContext,
  }
}
