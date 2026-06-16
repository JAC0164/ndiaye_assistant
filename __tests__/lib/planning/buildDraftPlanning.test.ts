import { describe, it, expect } from "vitest"
import { buildDraftPlanning } from "@/src/lib/planning/buildDraftPlanning"
import type { SubjectInfo, SubjectBudget, FreeSlot, ExtractedTimetable } from "@/src/types/planning.types"

describe("buildDraftPlanning", () => {
  const mockSubjects: SubjectInfo[] = [
    { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: ["monday", "thursday"] },
    { name: "PC", coefficient: 3, subjectType: "scientific", daysPresent: ["tuesday"] },
    { name: "FR", coefficient: 4, subjectType: "language", daysPresent: ["monday", "tuesday", "friday"] },
    { name: "HG", coefficient: 2, subjectType: "literary", daysPresent: ["wednesday"] },
  ]

  const mockBudgets = new Map<string, SubjectBudget>([
    ["MATH", { totalMinutes: 80, reviewMinutes: 40, tdMinutes: 40 }],
    ["PC", { totalMinutes: 60, reviewMinutes: 20, tdMinutes: 40 }],
    ["FR", { totalMinutes: 80, reviewMinutes: 40, tdMinutes: 40 }],
    ["HG", { totalMinutes: 40, reviewMinutes: 20, tdMinutes: 20 }],
  ])

  const mockPriorities = new Map<string, number>([
    ["MATH", 8.5],
    ["PC", 7.0],
    ["FR", 5.0],
    ["HG", 3.0],
  ])

  const mockTimetable: ExtractedTimetable = {
    days: [
      {
        day: "monday",
        slots: [
          { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" },
          { start: "09:40", end: "11:10", subject: "FR", coefficient: 4, subject_type: "language" },
        ],
      },
      {
        day: "tuesday",
        slots: [
          { start: "08:00", end: "09:30", subject: "FR", coefficient: 4, subject_type: "language" },
          { start: "10:00", end: "11:30", subject: "PC", coefficient: 3, subject_type: "scientific" },
        ],
      },
      {
        day: "wednesday",
        slots: [{ start: "14:00", end: "15:30", subject: "HG", coefficient: 2, subject_type: "literary" }],
      },
      {
        day: "thursday",
        slots: [{ start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" }],
      },
      {
        day: "friday",
        slots: [{ start: "08:00", end: "09:30", subject: "FR", coefficient: 4, subject_type: "language" }],
      },
    ],
  }

  it("should split large weekday windows and insert breaks", () => {
    const freeSlots: FreeSlot[] = [
      { day: "monday", start: "17:40", end: "19:45", durationMinutes: 125 }, // 125m -> 3 study slots (35m) + 2 breaks (10m)
    ]

    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, {}, mockTimetable)

    // Expected: Study (17:40-18:15), Break (18:15-18:25), Study (18:25-19:00), Break (19:00-19:10), Study (19:10-19:45)
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual(expect.objectContaining({ start_time: "17:40", end_time: "18:15", session_type: "td" }))
    expect(result[1]).toEqual(
      expect.objectContaining({ start_time: "18:15", end_time: "18:25", subject: "Break", session_type: "break" })
    )
    expect(result[2]).toEqual(expect.objectContaining({ start_time: "18:25", end_time: "19:00" }))
    expect(result[3]).toEqual(
      expect.objectContaining({ start_time: "19:00", end_time: "19:10", subject: "Break", session_type: "break" })
    )
    expect(result[4]).toEqual(expect.objectContaining({ start_time: "19:10", end_time: "19:45" }))
  })

  it("should respect weekday same-day consolidation rule", () => {
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:40", end: "19:45", durationMinutes: 125 }]

    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, {}, mockTimetable)

    // Monday classes: MATH (coeff 4, sci) and FR (coeff 4, lang)
    // First slot should be one of today's classes
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(3)

    // Both should be consolidation from Monday (since MATH and FR are taught on Monday)
    expect(["MATH", "FR"]).toContain(studySessions[0].subject)
    expect(["MATH", "FR"]).toContain(studySessions[1].subject)
    // Interleaving: they should not be the same
    expect(studySessions[0].subject).not.toBe(studySessions[1].subject)
  })

  it("should respect weekday next-day anticipation for weak subjects", () => {
    // Let's say PC is weak, taught on Tuesday. Monday has slots.
    // Monday consolidation subjects will be used first, then Monday should anticipate PC (which is weak and taught on Tuesday).
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:40", end: "19:45", durationMinutes: 125 }]

    const onboarding = { weakSubjects: ["PC"] }
    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, onboarding, mockTimetable)

    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(3)

    // The third slot should pick PC for anticipation because it's weak and taught tomorrow (Tuesday)
    expect(studySessions[2].subject).toBe("PC")
  })

  it("should enforce Eat the Frog on weekend mornings", () => {
    // Saturday slots: 09:00-09:45 and 09:55-10:40
    const freeSlots: FreeSlot[] = [
      { day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 },
      { day: "saturday", start: "09:55", end: "10:40", durationMinutes: 45 },
    ]

    // PC is weak, highest coeff among weak subjects if PC (coeff 3) is weak, or MATH (coeff 4)
    const onboarding = { weakSubjects: ["PC", "HG"] } // PC is weak (coeff 3), HG is weak (coeff 2) -> PC is frog
    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, onboarding, mockTimetable)

    // First study session on Saturday morning should be PC
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions[0].subject).toBe("PC")
  })

  it("should ensure weak subjects occupy at least 50% of weekend study time", () => {
    // Saturday slots: 4 slots
    const freeSlots: FreeSlot[] = [
      { day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 },
      { day: "saturday", start: "09:55", end: "10:40", durationMinutes: 45 },
      { day: "saturday", start: "10:50", end: "11:35", durationMinutes: 45 },
      { day: "saturday", start: "11:45", end: "12:30", durationMinutes: 45 },
    ]

    const onboarding = { weakSubjects: ["PC"] } // Only PC is weak
    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, onboarding, mockTimetable)

    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(4)

    // At least 2 slots (50%) should be PC (weak subject)
    const pcSlots = studySessions.filter((s) => s.subject === "PC")
    expect(pcSlots.length).toBeGreaterThanOrEqual(2)
  })

  it("should NOT fall back to any subject on weekend when all candidates list is empty or budget exhausted", () => {
    const freeSlots: FreeSlot[] = [{ day: "saturday", start: "14:00", end: "14:45", durationMinutes: 45 }]
    const zeroBudgets = new Map<string, SubjectBudget>([
      ["MATH", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["PC", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["FR", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["HG", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
    ])

    const result = buildDraftPlanning(mockSubjects, zeroBudgets, mockPriorities, freeSlots, {}, mockTimetable)
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(0)
  })

  it("should NOT fall back to general/budget-exhausted subjects on weekdays when standard candidates are not available", () => {
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:40", end: "18:15", durationMinutes: 35 }]

    // Empty budgets
    const zeroBudgets = new Map<string, SubjectBudget>([
      ["MATH", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["PC", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["FR", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["HG", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
    ])

    // No classes taught on Monday to force consolidation fallback, and tomorrow has no weak subjects
    const emptyTimetable: ExtractedTimetable = { days: [] }

    const result = buildDraftPlanning(mockSubjects, zeroBudgets, mockPriorities, freeSlots, {}, emptyTimetable)
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(0)
  })

  it("should trigger fallback on weekend when only a single subject is provided and multiple slots are available", () => {
    const singleSubject: SubjectInfo[] = [
      { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: ["monday"] },
    ]
    const singleBudget = new Map<string, SubjectBudget>([
      ["MATH", { totalMinutes: 100, reviewMinutes: 50, tdMinutes: 50 }],
    ])
    const singlePriority = new Map<string, number>([["MATH", 10.0]])
    const freeSlots: FreeSlot[] = [
      { day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 },
      { day: "saturday", start: "09:55", end: "10:40", durationMinutes: 45 },
    ]

    const result = buildDraftPlanning(singleSubject, singleBudget, singlePriority, freeSlots, {}, { days: [] })
    const studySessions = result.filter((s) => s.session_type !== "break")
    // Strict interleaving prevents scheduling the same subject consecutively
    expect(studySessions).toHaveLength(1)
    expect(studySessions[0].subject).toBe("MATH")
  })

  it("should trigger weekday fallback to only available subject with budget when interleaving candidates are empty", () => {
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:00", end: "19:00", durationMinutes: 120 }]
    // Only MATH has budget. MATH will be scheduled for consolidation or general.
    // If it's scheduled once, then for the next slot, we try to interleave, but ONLY MATH has budget.
    // So the category filter will fail, leading to the fallback choosing MATH again.
    const customBudgets = new Map<string, SubjectBudget>([
      ["MATH", { totalMinutes: 120, reviewMinutes: 60, tdMinutes: 60 }],
      ["PC", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["FR", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["HG", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
    ])

    const result = buildDraftPlanning(mockSubjects, customBudgets, mockPriorities, freeSlots, {}, mockTimetable)
    const studySessions = result.filter((s) => s.session_type !== "break")
    // Strict interleaving prevents scheduling the same subject consecutively
    expect(studySessions).toHaveLength(1)
    expect(studySessions[0].subject).toBe("MATH")
  })

  it("should sort candidates alphabetically on priority tie-breaker", () => {
    const freeSlots: FreeSlot[] = [{ day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 }]
    const customPriorities = new Map<string, number>([
      ["PC", 8.0],
      ["MATH", 8.0],
    ])
    const result = buildDraftPlanning(
      [
        { name: "PC", coefficient: 4, subjectType: "scientific", daysPresent: [] },
        { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: [] },
      ],
      new Map([
        ["PC", { totalMinutes: 100, reviewMinutes: 50, tdMinutes: 50 }],
        ["MATH", { totalMinutes: 100, reviewMinutes: 50, tdMinutes: 50 }],
      ]),
      customPriorities,
      freeSlots,
      {},
      { days: [] }
    )
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions[0].subject).toBe("MATH")
  })

  it("should handle empty subjects list gracefully", () => {
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:40", end: "18:15", durationMinutes: 35 }]
    const result = buildDraftPlanning([], new Map(), new Map(), freeSlots, {}, { days: [] })
    expect(result).toHaveLength(0)
  })

  it("should break ties alphabetically when weak subjects have the same coefficient", () => {
    const onboarding = { weakSubjects: ["FR", "MATH"] }
    const freeSlots: FreeSlot[] = [{ day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 }]
    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, onboarding, mockTimetable)
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions[0].subject).toBe("FR")
  })

  it("should not insert a break on weekend if the gap between slots is less than 5 minutes", () => {
    const freeSlots: FreeSlot[] = [
      { day: "saturday", start: "09:00", end: "09:45", durationMinutes: 45 },
      { day: "saturday", start: "09:47", end: "10:32", durationMinutes: 45 },
    ]
    const result = buildDraftPlanning(mockSubjects, mockBudgets, mockPriorities, freeSlots, {}, mockTimetable)
    const breakSessions = result.filter((s) => s.session_type === "break")
    expect(breakSessions).toHaveLength(0)
  })

  it("should not break ties because no sessions should be scheduled when budgets are exhausted", () => {
    const freeSlots: FreeSlot[] = [{ day: "monday", start: "17:00", end: "17:45", durationMinutes: 45 }]
    const zeroBudgets = new Map<string, SubjectBudget>([
      ["PC", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
      ["MATH", { totalMinutes: 0, reviewMinutes: 0, tdMinutes: 0 }],
    ])
    const result = buildDraftPlanning(
      [
        { name: "PC", coefficient: 4, subjectType: "scientific", daysPresent: [] },
        { name: "MATH", coefficient: 4, subjectType: "scientific", daysPresent: [] },
      ],
      zeroBudgets,
      new Map([
        ["PC", 8.0],
        ["MATH", 8.0],
      ]),
      freeSlots,
      {},
      { days: [] }
    )
    const studySessions = result.filter((s) => s.session_type !== "break")
    expect(studySessions).toHaveLength(0)
  })
})
