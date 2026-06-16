import { describe, it, expect } from "vitest"
import { extractSubjects } from "../../../src/lib/planning/extractSubjects"
import { buildFreeSlots } from "../../../src/lib/planning/buildFreeSlots"
import { computeBudgets } from "../../../src/lib/planning/computeBudgets"
import { computePriority } from "../../../src/lib/planning/computePriority"
import { prePlannerNode } from "../../../src/lib/langgraph/nodes/prePlannerNode"
import { ExtractedTimetable, OnboardingForm } from "../../../src/types/planning.types"

const TEST_TIMETABLE: ExtractedTimetable = {
  filiere: "L2",
  days: [
    {
      day: "monday",
      slots: [
        { start: "08:00", end: "09:30", subject: "Développement Personnel", coefficient: null, subject_type: "other" },
        { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "15:00", end: "16:30", subject: "ESP", coefficient: 2, subject_type: "language" },
      ],
    },
    {
      day: "tuesday",
      slots: [
        { start: "08:00", end: "09:30", subject: "PC", coefficient: 3, subject_type: "scientific" },
        { start: "09:40", end: "11:10", subject: "SVT", coefficient: 2, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "ANG", coefficient: 3, subject_type: "language" },
        { start: "15:00", end: "16:30", subject: "HG", coefficient: 3, subject_type: "literary" },
      ],
    },
    {
      day: "wednesday",
      slots: [
        { start: "08:00", end: "09:30", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "11:20", end: "12:50", subject: "ECO", coefficient: 2, subject_type: "literary" },
      ],
    },
    {
      day: "thursday",
      slots: [
        { start: "08:00", end: "09:30", subject: "ANG", coefficient: 3, subject_type: "language" },
        { start: "09:40", end: "11:10", subject: "HG", coefficient: 3, subject_type: "literary" },
        { start: "11:20", end: "12:50", subject: "ESP", coefficient: 2, subject_type: "language" },
        { start: "15:00", end: "16:30", subject: "ECO", coefficient: 2, subject_type: "literary" },
      ],
    },
    {
      day: "friday",
      slots: [
        { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" },
        { start: "09:40", end: "11:10", subject: "FR", coefficient: 5, subject_type: "literary" },
        { start: "11:20", end: "12:50", subject: "SVT", coefficient: 2, subject_type: "scientific" },
        { start: "15:00", end: "16:30", subject: "PC", coefficient: 3, subject_type: "scientific" },
      ],
    },
  ],
}

const TEST_ONBOARDING: OnboardingForm = {
  weakSubjects: [],
  bedtime: "22:00",
  blockedSlots: [
    { id: "1", day: "tuesday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
    { id: "2", day: "thursday", startTime: "18:00", endTime: "20:00", reason: "Cours du soir" },
  ],
}

describe("Study Planner Redesign Integration Test (L2 reference case)", () => {
  it("verifies the chained pre-planning algorithm behavior", () => {
    // 1. extractSubjects returns exactly 8 subjects (DP excluded)
    const subjects = extractSubjects(TEST_TIMETABLE)
    expect(subjects).toHaveLength(8)
    const subjectNames = subjects.map((s) => s.name)
    expect(subjectNames).not.toContain("Développement Personnel")

    // 2. buildFreeSlots: respects bedtime and blocked slots
    const freeSlots = buildFreeSlots(TEST_TIMETABLE, TEST_ONBOARDING.bedtime, TEST_ONBOARDING.blockedSlots)

    // Check bedtime
    for (const slot of freeSlots) {
      expect(slot.end <= TEST_ONBOARDING.bedtime).toBe(true)
    }

    // Check Tuesday 18:00–20:00 and Thursday 18:00–20:00 do not overlap with any free slot
    const tuesdaySlots = freeSlots.filter((s) => s.day === "tuesday")
    for (const slot of tuesdaySlots) {
      expect(slot.start >= "20:00" || slot.end <= "18:00").toBe(true)
    }
    const thursdaySlots = freeSlots.filter((s) => s.day === "thursday")
    for (const slot of thursdaySlots) {
      expect(slot.start >= "20:00" || slot.end <= "18:00").toBe(true)
    }

    // Saturday has slots totaling >= 50 min
    const satSlots = freeSlots.filter((s) => s.day === "saturday")
    const satTotal = satSlots.reduce((sum, s) => sum + s.durationMinutes, 0)
    expect(satTotal).toBeGreaterThanOrEqual(50)

    // Sunday has >= 1 slot
    const sunSlots = freeSlots.filter((s) => s.day === "sunday")
    expect(sunSlots.length).toBeGreaterThanOrEqual(1)

    // 3. computeBudgets: Français (coeff 5) budget > Économie (coeff 2) budget
    const budgets = computeBudgets(subjects, 400, "milieu_trimestre")

    const francaisBudget = budgets.get("FR")!
    const ecoBudget = budgets.get("ECO")!
    expect(francaisBudget.totalMinutes).toBeGreaterThan(ecoBudget.totalMinutes)

    // 4. computePriority: all 8 subjects have scores > 0
    const priorities = computePriority(subjects, new Map(), new Map())
    for (const sub of subjects) {
      expect(priorities.get(sub.name)).toBeGreaterThan(0)
    }

    // 5. prePlannerNode: returns state update with preplannerConstraints string
    const resultState = prePlannerNode({
      timetableImage: "",
      timetableImageMimeType: "",
      onboardingData: {
        ...TEST_ONBOARDING,
        daysSinceLastRevision: [],
      },
      extractedTimetable: TEST_TIMETABLE,
      timetableSummary: "",
      studentProfileContext: "",
      isValidTimetable: true,
      generatedPlanning: [],
      coefficientTable: "",
      preplannerConstraints: "",
      planningValidation: null,
    })

    expect(resultState).toHaveProperty("preplannerConstraints")
    const constraints = resultState.preplannerConstraints!
    expect(constraints).toContain("#SUBJECTS")
    expect(constraints).toContain("#SLOTS")

    // Verify constraints string contains all 8 subject names and zero others
    for (const name of subjectNames) {
      expect(constraints).toContain(name)
    }
    expect(constraints).not.toContain("Développement Personnel")
  })
})
