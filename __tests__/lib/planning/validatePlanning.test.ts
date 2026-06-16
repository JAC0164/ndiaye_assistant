import { describe, it, expect } from "vitest"
import { validatePlanning } from "../../../src/lib/planning/validatePlanning"
import { GeneratedSeance } from "@/src/lib/langgraph/state"
import { BlockedSlot } from "@/src/types/planning.types"

describe("validatePlanning with draftPlanning", () => {
  const mockDraft: GeneratedSeance[] = [
    {
      day_of_week: "monday",
      start_time: "17:40",
      end_time: "18:15",
      subject: "MATH",
      session_type: "td",
      pedagogical_note: "",
    },
    {
      day_of_week: "monday",
      start_time: "18:15",
      end_time: "18:25",
      subject: "Break",
      session_type: "break",
      pedagogical_note: "",
    },
    {
      day_of_week: "monday",
      start_time: "18:25",
      end_time: "19:00",
      subject: "FR",
      session_type: "review",
      pedagogical_note: "",
    },
  ]

  it("should handle empty or undefined draft planning", () => {
    const resultUndefined = validatePlanning([], "22:00", [])
    expect(resultUndefined.validatedPlanning).toEqual([])
    expect(resultUndefined.wasRepaired).toBe(false)

    const resultEmpty = validatePlanning([], "22:00", [], { draftPlanning: [] })
    expect(resultEmpty.validatedPlanning).toEqual([])
    expect(resultEmpty.wasRepaired).toBe(false)
  })

  it("should pass through valid matching planning", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Résous 3 exercices.",
      },
      {
        day_of_week: "monday",
        start_time: "18:15",
        end_time: "18:25",
        subject: "Break",
        session_type: "break",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:25",
        end_time: "19:00",
        subject: "FR",
        session_type: "review",
        pedagogical_note: "Explique le concept.",
      },
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.validatedPlanning).toHaveLength(3)
    expect(result.wasRepaired).toBe(false)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("should restore missing sessions from draft", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Résous 3 exercices.",
      },
      // FR is missing
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.validatedPlanning).toHaveLength(3) // FR restored + break
    expect(result.wasRepaired).toBe(true)
    expect(result.errors).toHaveLength(2) // Missing Break, Missing FR
    expect(result.errors[1].check).toBe("missing_session")
    expect(result.validatedPlanning[2].subject).toBe("FR")
    expect(result.validatedPlanning[2].pedagogical_note).toContain("Explique à voix haute")
  })

  it("should discard extra sessions", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Résous 3 exercices.",
      },
      {
        day_of_week: "monday",
        start_time: "18:15",
        end_time: "18:25",
        subject: "Break",
        session_type: "break",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:25",
        end_time: "19:00",
        subject: "FR",
        session_type: "review",
        pedagogical_note: "Explique.",
      },
      // Extra session
      {
        day_of_week: "monday",
        start_time: "19:00",
        end_time: "19:35",
        subject: "PC",
        session_type: "td",
        pedagogical_note: "Extra.",
      },
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.validatedPlanning).toHaveLength(3)
    expect(result.wasRepaired).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].check).toBe("extra_session")
    expect(result.removedSessions).toHaveLength(1)
    expect(result.removedSessions[0].subject).toBe("PC")
  })

  it("should warn on passive verbs in notes", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Relire le cours de maths.",
      },
      {
        day_of_week: "monday",
        start_time: "18:15",
        end_time: "18:25",
        subject: "Break",
        session_type: "break",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:25",
        end_time: "19:00",
        subject: "FR",
        session_type: "review",
        pedagogical_note: "Explique.",
      },
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.wasRepaired).toBe(false) // Passive learning notes generate warning but are not auto-modified
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].check).toBe("passive_learning")
  })

  it("should correct invalid session type", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "break" as any,
        pedagogical_note: "Invalid type.",
      },
      {
        day_of_week: "monday",
        start_time: "18:15",
        end_time: "18:25",
        subject: "Break",
        session_type: "break",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:25",
        end_time: "19:00",
        subject: "FR",
        session_type: "review",
        pedagogical_note: "Explique.",
      },
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.wasRepaired).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].check).toBe("session_type")
    expect(result.validatedPlanning[0].session_type).toBe("td") // Reset to draft type
  })

  it("should repair empty pedagogical notes with a default recall note", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:40",
        end_time: "18:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:15",
        end_time: "18:25",
        subject: "Break",
        session_type: "break",
        pedagogical_note: "",
      },
      {
        day_of_week: "monday",
        start_time: "18:25",
        end_time: "19:00",
        subject: "FR",
        session_type: "review",
        pedagogical_note: "Explique.",
      },
    ]

    const result = validatePlanning(generated, "22:00", [], { draftPlanning: mockDraft })

    expect(result.wasRepaired).toBe(true)
    expect(result.validatedPlanning[0].pedagogical_note).toContain("liste les concepts clés")
  })

  it("should detect and report bedtime curfew violations", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "21:30",
        end_time: "22:15",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Exos.",
      },
    ]
    const result = validatePlanning(generated, "22:00", [], { draftPlanning: [] })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].check).toBe("bedtime")
  })

  it("should detect and report blocked slot overlaps", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "18:45",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Exos.",
      },
    ]
    const blocked: BlockedSlot[] = [
      { id: "1", day: "monday", startTime: "18:30", endTime: "20:00", reason: "Cours particulier" },
    ]
    const result = validatePlanning(generated, "22:00", blocked, { draftPlanning: [] })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].check).toBe("blocked_slot")
  })

  it("should not report error when blocked slots do not overlap", () => {
    const generated: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "18:45",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Exos.",
      },
    ]
    const blocked: BlockedSlot[] = [
      { id: "1", day: "monday", startTime: "16:00", endTime: "17:00", reason: "Before" },
      { id: "2", day: "monday", startTime: "19:00", endTime: "20:00", reason: "After" },
    ]
    const result = validatePlanning(generated, "22:00", blocked, { draftPlanning: [] })
    expect(result.errors).toHaveLength(0)
  })

  it("should cover all logical branch conditions of findIndex matching", () => {
    const draft: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "19:00",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "",
      },
    ]
    const generated: GeneratedSeance[] = [
      // 1. Day of week is different
      {
        day_of_week: "tuesday",
        start_time: "18:00",
        end_time: "19:00",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "",
      },
      // 2. Start time is different
      {
        day_of_week: "monday",
        start_time: "18:30",
        end_time: "19:00",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "",
      },
      // 3. End time is different
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "19:30",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "",
      },
      // 4. Subject is different
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "19:00",
        subject: "FR",
        session_type: "td",
        pedagogical_note: "",
      },
      // 5. Perfect match
      {
        day_of_week: "monday",
        start_time: "18:00",
        end_time: "19:00",
        subject: "MATH",
        session_type: "td",
        pedagogical_note: "Perfect match",
      },
    ]
    const result = validatePlanning(generated, "22:00", [], { draftPlanning: draft })
    expect(result.wasRepaired).toBe(true)
    expect(result.errors).toHaveLength(4)
  })
})
