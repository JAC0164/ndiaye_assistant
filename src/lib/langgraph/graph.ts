import { END, START, StateGraph } from "@langchain/langgraph"

import { plannerAgent } from "./nodes/plannerAgent"
import { profileAgent } from "./nodes/profileAgent"
import { visionAgent } from "./nodes/visionAgent"
import { PlanningGraphAnnotation, PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate } from "./state"
import type { ModelOverrides } from "./providers"
import { extractSubjects } from "../planning/extractSubjects"
import { buildFreeSlots } from "../planning/buildFreeSlots"
import { computeBudgets } from "../planning/computeBudgets"
import { computePriority } from "../planning/computePriority"
import { parseCoefficientTable } from "../planning/constants"
import type { BlockedSlot } from "@/src/types/planning.types"

interface GraphOnboarding {
  bedtime?: string
  blockedSlots?: BlockedSlot[]
  academicPeriod?: string
  daysSinceLastRevision?: [string, number][]
  weakSubjects?: string[]
}

function passValidatedVision(): PlanningGraphAnnotationUpdate {
  return {}
}

function routeAfterVision(state: PlanningGraphAnnotationState) {
  if (process.env.STOP_AT_AGENT === "vision") {
    return "stop"
  }
  return state.isValidTimetable ? "valid" : "invalid"
}

export function prePlannerNode(state: PlanningGraphAnnotationState): PlanningGraphAnnotationUpdate {
  const timetable = state.extractedTimetable
  if (!timetable) {
    return {
      preplannerConstraints: "No timetable available.",
    }
  }

  // Normalize subjects and enrich coefficients in the timetable
  const coeffMap = parseCoefficientTable(state.coefficientTable)
  if (timetable.days) {
    for (const day of timetable.days) {
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
  const bedtime = onboarding.bedtime || "22:00"
  const blockedSlots = onboarding.blockedSlots || []
  const period = onboarding.academicPeriod || "milieu_trimestre"

  // 1. extractSubjects
  const subjects = extractSubjects(timetable)
  
  // 2. buildFreeSlots
  const freeSlots = buildFreeSlots(timetable, bedtime, blockedSlots)
  const totalAvailableMinutes = freeSlots.reduce((sum, slot) => sum + slot.durationMinutes, 0)

  // 3. computeBudgets
  const budgets = computeBudgets(subjects, totalAvailableMinutes, period)

  // 4. computePriority
  const daysSinceMap = new Map<string, number>(onboarding.daysSinceLastRevision || [])
  const performanceLevels = new Map<string, "weak">()
  if (onboarding.weakSubjects && Array.isArray(onboarding.weakSubjects)) {
    for (const subj of onboarding.weakSubjects) {
      performanceLevels.set(subj.trim().toUpperCase(), "weak")
    }
  }
  const priorities = computePriority(subjects, daysSinceMap, performanceLevels)

  // 5. Format preplannerConstraints
  const lines: string[] = ["ALLOWLIST & BUDGETS:"]
  subjects.forEach((subject, idx) => {
    const budget = budgets.get(subject.name)
    const priority = priorities.get(subject.name) ?? 0
    if (budget) {
      lines.push(`${idx + 1}. ${subject.name} — budget: ${budget.totalMinutes} min (review: ${budget.reviewMinutes} min, td: ${budget.tdMinutes} min) — priority: ${priority}`)
    } else {
      lines.push(`${idx + 1}. ${subject.name} — budget: 0 min — priority: ${priority}`)
    }
  })

  lines.push("\nFREE SLOTS:")
  if (freeSlots.length === 0) {
    lines.push("(No free slots available. Adjust bedtime or blocked slots.)")
  } else {
    for (const slot of freeSlots) {
      const capitalizedDay = slot.day.charAt(0).toUpperCase() + slot.day.slice(1)
      lines.push(`- ${capitalizedDay} ${slot.start}–${slot.end} (${slot.durationMinutes} min)`)
    }
  }

  return {
    preplannerConstraints: lines.join("\n"),
    extractedTimetable: timetable,
  }
}

export function createPlanningGraph(modelOverrides?: ModelOverrides) {
  return new StateGraph(PlanningGraphAnnotation)
    .addNode("vision", (state) => visionAgent(state, modelOverrides?.vision))
    .addNode("profile", (state) => profileAgent(state, modelOverrides?.profile))
    .addNode("visionValidated", passValidatedVision)
    .addNode("prePlanner", prePlannerNode)
    .addNode("planner", (state) => plannerAgent(state, modelOverrides?.planner))
    .addEdge(START, "vision")
    .addEdge(START, "profile")
    .addConditionalEdges("vision", routeAfterVision, {
      valid: "visionValidated",
      invalid: END,
      stop: END,
    })
    .addEdge(["visionValidated", "profile"], "prePlanner")
    .addEdge("prePlanner", "planner")
    .addEdge("planner", END)
    .compile()
}
