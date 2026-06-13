import { describe, it, expect } from "vitest"
import { validatePlanning } from "../../../src/lib/planning/validatePlanning"
import { GeneratedSeance } from "../../../src/lib/langgraph/state"
import { BlockedSlot } from "../../../src/types/planning.types"

const ALLOWED_SUBJECTS = ["MATH", "FR", "PC"]

const TEST_PLANNING: GeneratedSeance[] = [
  {
    day_of_week: "monday",
    start_time: "17:00",
    end_time: "17:45",
    subject: "math", // needs casing canonicalization
    session_type: "review",
    pedagogical_note: "Relire le cours sur les fonctions.",
  },
  {
    day_of_week: "monday",
    start_time: "17:45",
    end_time: "18:00",
    subject: "Pause", // break subject, not in allowlist but should be ignored
    session_type: "break",
    pedagogical_note: "", // empty note, needs fallback
  },
  {
    day_of_week: "monday",
    start_time: "18:00",
    end_time: "18:45",
    subject: "GER", // hallucinated subject, should be removed
    session_type: "review",
    pedagogical_note: "Relire le vocabulaire.",
  },
  {
    day_of_week: "tuesday",
    start_time: "18:30",
    end_time: "19:15",
    subject: "FR",
    session_type: "td",
    pedagogical_note: "Faire l'exercice de grammaire.", // overlaps blocked slot Tuesday 18:00-19:00, should be flagged
  },
  {
    day_of_week: "wednesday",
    start_time: "21:30",
    end_time: "22:15",
    subject: "PC",
    session_type: "review",
    pedagogical_note: "Faire le résumé du cours.", // ends after bedtime (22:00), should be flagged
  },
]

const TEST_BLOCKED: BlockedSlot[] = [
  { id: "1", day: "tuesday", startTime: "18:00", endTime: "19:00", reason: "Soutien scolaire" },
]

describe("validatePlanning", () => {
  it("removes unauthorized subjects, corrects casing, flags bedtime/blocked slot overlaps, fills empty notes, and caps free day sessions", () => {
    const result = validatePlanning(TEST_PLANNING, ALLOWED_SUBJECTS, "22:00", TEST_BLOCKED)

    // Verify repairs
    expect(result.wasRepaired).toBe(true)

    // 1. Casing canonicalization check
    const maths = result.validatedPlanning.find((s) => s.day_of_week === "monday" && s.start_time === "17:00")
    expect(maths).toBeDefined()
    expect(maths?.subject).toBe("MATH") // Casing corrected

    // 2. Hallucinated subject check
    const allemand = result.validatedPlanning.find((s) => s.subject === "GER")
    expect(allemand).toBeUndefined()
    expect(result.removedSessions).toHaveLength(1)
    expect(result.removedSessions[0].subject).toBe("GER")
    expect(result.errors.some((e) => e.check === "allowed_subject")).toBe(true)

    // 3. Break subject check
    const pause = result.validatedPlanning.find((s) => s.session_type === "break")
    expect(pause).toBeDefined()
    expect(pause?.pedagogical_note).toBe("Fais une pause pour te détendre.") // Empty note warning handled
    expect(result.warnings.some((w) => w.check === "empty_pedagogical_note")).toBe(true)

    // 4. Blocked slot overlap check (flagged but kept)
    const francais = result.validatedPlanning.find((s) => s.subject === "FR")
    expect(francais).toBeDefined()
    expect(result.errors.some((e) => e.check === "blocked_slot_overlap")).toBe(true)

    // 5. Bedtime check (flagged but kept)
    const pc = result.validatedPlanning.find((s) => s.subject === "PC")
    expect(pc).toBeDefined()
    expect(result.errors.some((e) => e.check === "bedtime_boundary")).toBe(true)
  })

  it("removes excess sessions on free days beyond maxSessionsPerFreeDay", () => {
    const subjects = Array.from({ length: 8 }, (_, i) => `S${i}`)
    const sessions: GeneratedSeance[] = [
      ...subjects.map((s, i) => ({
        day_of_week: "saturday" as const,
        start_time: `${String(9 + i).padStart(2, "0")}:00`,
        end_time: `${String(9 + i).padStart(2, "0")}:45`,
        subject: s,
        session_type: "review" as const,
        pedagogical_note: "test",
      })),
      {
        day_of_week: "saturday" as const,
        start_time: "12:00",
        end_time: "12:30",
        subject: "Pause",
        session_type: "break" as const,
        pedagogical_note: "",
      },
    ]

    const result = validatePlanning(sessions, subjects, "22:00", [])

    const satStudySessions = result.validatedPlanning.filter(
      (s) => s.day_of_week === "saturday" && s.session_type !== "break"
    )
    expect(satStudySessions).toHaveLength(6)
    expect(result.wasRepaired).toBe(true)
    expect(result.removedSessions.length).toBeGreaterThanOrEqual(2)
    expect(result.errors.some((e) => e.check === "free_day_session_cap")).toBe(true)
  })

  it("caps sunday sessions independently of saturday", () => {
    const subjects = Array.from({ length: 7 }, (_, i) => `Sub${i}`)
    const sessions: GeneratedSeance[] = subjects.map((s, i) => ({
      day_of_week: "sunday" as const,
      start_time: `${String(9 + i).padStart(2, "0")}:00`,
      end_time: `${String(9 + i).padStart(2, "0")}:45`,
      subject: s,
      session_type: "review" as const,
      pedagogical_note: "test",
    }))

    const result = validatePlanning(sessions, subjects, "22:00", [])
    const sunStudy = result.validatedPlanning.filter((s) => s.day_of_week === "sunday" && s.session_type !== "break")
    expect(sunStudy).toHaveLength(6)
    expect(result.removedSessions).toHaveLength(1)
  })

  it("does not cap free days already under maxSessionsPerFreeDay", () => {
    const sessions: GeneratedSeance[] = Array.from({ length: 4 }, (_, i) => ({
      day_of_week: "saturday" as const,
      start_time: `${String(9 + i).padStart(2, "0")}:00`,
      end_time: `${String(9 + i).padStart(2, "0")}:45`,
      subject: `X${i}`,
      session_type: "review" as const,
      pedagogical_note: "test",
    }))
    const result = validatePlanning(sessions, ["X0", "X1", "X2", "X3"], "22:00", [])
    expect(result.validatedPlanning).toHaveLength(4)
    expect(result.wasRepaired).toBe(false)
    expect(result.removedSessions).toHaveLength(0)
  })

  it("does not flag sessions that don't overlap with blocked slots on the same day (line 78 false branch)", () => {
    const sessions: GeneratedSeance[] = [
      {
        day_of_week: "tuesday",
        start_time: "17:00",
        end_time: "17:45",
        subject: "MATH",
        session_type: "review",
        pedagogical_note: "test",
      },
    ]
    const result = validatePlanning(sessions, ["MATH"], "22:00", TEST_BLOCKED)
    expect(result.validatedPlanning).toHaveLength(1)
    expect(result.errors.filter((e) => e.check === "blocked_slot_overlap")).toHaveLength(0)
  })

  it("fills empty pedagogical note for study session with whitespace-only note (lines 90-92 false branch)", () => {
    const sessions: GeneratedSeance[] = [
      {
        day_of_week: "monday",
        start_time: "17:00",
        end_time: "17:45",
        subject: "MATH",
        session_type: "review",
        pedagogical_note: "   ",
      },
    ]
    const result = validatePlanning(sessions, ["MATH"], "22:00", [])
    const mathSession = result.validatedPlanning[0]
    expect(mathSession.pedagogical_note).toBe("Révise tes notes et refais les exercices clés.")
    expect(result.wasRepaired).toBe(true)
    expect(result.warnings.some((w) => w.check === "empty_pedagogical_note")).toBe(true)
  })
})
