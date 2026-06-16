import type { BlockedSlot, ExtractedTimetable, FreeSlot } from "@/src/types/planning.types"
import { buildFreeSlots } from "../../planning/buildFreeSlots"
import { computeBudgets } from "../../planning/computeBudgets"
import { computePriority } from "../../planning/computePriority"
import { parseCoefficientTable } from "../../planning/constants"
import { extractSubjects } from "../../planning/extractSubjects"
import { PLANNING_CONFIG, type AcademicPeriod } from "../../planning/planningConfig"
import { buildDraftPlanning } from "../../planning/buildDraftPlanning"
import { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate } from "../state"
import { timetableToMarkdown } from "./visionAgent"

interface GraphOnboarding {
  bedtime?: string
  blockedSlots?: BlockedSlot[]
  academicPeriod?: string
  weakSubjects?: string[]
}

export function prePlannerNode(state: PlanningGraphAnnotationState): PlanningGraphAnnotationUpdate {
  const timetable = state.extractedTimetable

  if (!timetable) return { preplannerConstraints: "No timetable available." }

  const updatedTimetable = JSON.parse(JSON.stringify(timetable)) as ExtractedTimetable

  const excludedUpper = PLANNING_CONFIG.subjectExclusionList.map((s) => s.trim().toUpperCase())
  const newBlockedSlots: BlockedSlot[] = []

  if (updatedTimetable.days) {
    for (const day of updatedTimetable.days) {
      if (day.slots) {
        const filteredSlots: typeof day.slots = []
        for (const slot of day.slots) {
          const normKey = slot.subject.trim().toUpperCase()
          if (excludedUpper.includes(normKey)) {
            newBlockedSlots.push({
              id: `excluded-slot-${day.day}-${slot.start}-${slot.end}`,
              day: day.day.toLowerCase() as BlockedSlot["day"],
              startTime: slot.start,
              endTime: slot.end,
              reason: `Class: ${slot.subject}`,
            })
          } else {
            filteredSlots.push(slot)
          }
        }
        day.slots = filteredSlots
      }
    }
  }

  const coeffMap = parseCoefficientTable(state.coefficientTable)
  if (updatedTimetable.days) {
    for (const day of updatedTimetable.days) {
      if (day.slots) {
        for (const slot of day.slots) {
          slot.subject = slot.subject.trim().toUpperCase()
          const normKey = slot.subject
          if (coeffMap.has(normKey)) {
            slot.coefficient = coeffMap.get(normKey)!
          }
        }
      }
    }
  }

  const onboarding = (state.onboardingData || {}) as GraphOnboarding
  const bedtime = onboarding.bedtime || "23:59"
  const blockedSlots = [...(onboarding.blockedSlots || []), ...newBlockedSlots]
  const period: AcademicPeriod = (
    ["debut_trimestre", "milieu_trimestre", "pre_exam", "post_exam"].includes(onboarding.academicPeriod ?? "")
      ? onboarding.academicPeriod
      : "milieu_trimestre"
  ) as AcademicPeriod

  const subjects = extractSubjects(updatedTimetable)
  const freeSlots = buildFreeSlots(updatedTimetable, bedtime, blockedSlots)
  const totalAvailableMinutes = freeSlots.reduce((sum, slot) => sum + slot.durationMinutes, 0)

  const budgets = computeBudgets(subjects, totalAvailableMinutes, period)

  const performanceLevels = new Map<string, "weak">()
  if (onboarding.weakSubjects && Array.isArray(onboarding.weakSubjects)) {
    for (const subj of onboarding.weakSubjects) {
      performanceLevels.set(subj.trim().toUpperCase(), "weak")
    }
  }
  const priorities = computePriority(subjects, new Map(), performanceLevels)

  const dayAbbr: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  }

  const lines: string[] = []

  lines.push("#SUBJECTS")
  lines.push("NAME|COEFF|TYPE|BUDGET|REV|TD|PRIO|LVL|WEAK|DAYS")

  const priorityLevel = (score: number): string =>
    score >= 8 ? "VERY_HIGH" : score >= 5 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW"

  const typeShort: Record<string, string> = { scientific: "SCI", literary: "LIT", language: "LANG", other: "OTHER" }

  subjects.forEach((subject) => {
    const budget = budgets.get(subject.name)
    const priority = priorities.get(subject.name) ?? 0
    const total = budget?.totalMinutes ?? 0
    const rev = budget?.reviewMinutes ?? 0
    const td = budget?.tdMinutes ?? 0
    const weak = performanceLevels.has(subject.name) ? "WEAK" : ""
    const days = subject.daysPresent.map((d) => dayAbbr[d.toLowerCase()]).join(",")
    lines.push(
      `${subject.name}|${subject.coefficient}|${typeShort[subject.subjectType]}|${total}|${rev}|${td}|${priority.toFixed(1)}|${priorityLevel(priority)}|${weak}|${days}`
    )
  })

  const result = lines.join("\n")

  const draftPlanning = buildDraftPlanning(
    subjects,
    budgets,
    priorities,
    freeSlots,
    onboarding,
    updatedTimetable
  )

  const updatedSummary = timetableToMarkdown(updatedTimetable)

  return {
    preplannerConstraints: result,
    draftPlanning,
    extractedTimetable: updatedTimetable,
    timetableSummary: updatedSummary,
  }
}
