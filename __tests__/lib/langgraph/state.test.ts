import { describe, it, expect } from "vitest"
import {
  dayOfWeekSchema,
  sessionTypeSchema,
  generatedSeanceSchema,
  visionAgentOutputSchema,
  profileAgentOutputSchema,
  plannerAgentOutputSchema,
  GeneratedSeance,
  PlanningGraphAnnotation,
} from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState, PlanningGraphAnnotationUpdate } from "@/src/lib/langgraph/state"

describe("dayOfWeekSchema", () => {
  it("accepts all valid days", () => {
    const valid = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
    for (const day of valid) {
      expect(dayOfWeekSchema.parse(day)).toBe(day)
    }
  })

  it("rejects invalid day string", () => {
    expect(() => dayOfWeekSchema.parse("mond")).toThrow()
    expect(() => dayOfWeekSchema.parse("")).toThrow()
    expect(() => dayOfWeekSchema.parse("MONDAY")).toThrow()
  })

  it("rejects non-string values", () => {
    expect(() => dayOfWeekSchema.parse(null)).toThrow()
    expect(() => dayOfWeekSchema.parse(undefined)).toThrow()
    expect(() => dayOfWeekSchema.parse(123)).toThrow()
    expect(() => dayOfWeekSchema.parse({})).toThrow()
  })
})

describe("sessionTypeSchema", () => {
  it("accepts all valid session types", () => {
    const valid = ["td", "review", "break"] as const
    for (const t of valid) {
      expect(sessionTypeSchema.parse(t)).toBe(t)
    }
  })

  it("rejects invalid session type", () => {
    expect(() => sessionTypeSchema.parse("lecture")).toThrow()
    expect(() => sessionTypeSchema.parse("")).toThrow()
    expect(() => sessionTypeSchema.parse("COURSE")).toThrow()
  })

  it("rejects non-string values", () => {
    expect(() => sessionTypeSchema.parse(null)).toThrow()
    expect(() => sessionTypeSchema.parse(undefined)).toThrow()
  })
})

describe("generatedSeanceSchema", () => {
  const validSeance = {
    day_of_week: "monday",
    start_time: "08:00",
    end_time: "09:30",
    subject: "Mathématiques",
    session_type: "td",
    pedagogical_note: "Réviser les dérivées.",
  }

  it("accepts a valid seance", () => {
    const result = generatedSeanceSchema.parse(validSeance)
    expect(result.day_of_week).toBe("monday")
    expect(result.start_time).toBe("08:00")
    expect(result.end_time).toBe("09:30")
    expect(result.subject).toBe("Mathématiques")
    expect(result.session_type).toBe("td")
    expect(result.pedagogical_note).toBe("Réviser les dérivées.")
  })

  it("rejects missing required fields", () => {
    const { day_of_week, ...noDay } = validSeance
    expect(() => generatedSeanceSchema.parse(noDay)).toThrow()

    const { subject, ...noSubject } = validSeance
    expect(() => generatedSeanceSchema.parse(noSubject)).toThrow()
  })

  it("rejects invalid time format", () => {
    expect(() => generatedSeanceSchema.parse({ ...validSeance, start_time: "8:00" })).toThrow()
    expect(() => generatedSeanceSchema.parse({ ...validSeance, start_time: "" })).toThrow()
    expect(() => generatedSeanceSchema.parse({ ...validSeance, start_time: "9:30" })).toThrow()
    expect(() => generatedSeanceSchema.parse({ ...validSeance, end_time: "09:30 PM" })).toThrow()
  })

  it("rejects empty subject", () => {
    expect(() => generatedSeanceSchema.parse({ ...validSeance, subject: "" })).toThrow()
  })

  it("rejects invalid day_of_week", () => {
    expect(() => generatedSeanceSchema.parse({ ...validSeance, day_of_week: "funday" })).toThrow()
  })

  it("rejects invalid session_type", () => {
    expect(() => generatedSeanceSchema.parse({ ...validSeance, session_type: "exam" })).toThrow()
  })

  it("strips extra fields", () => {
    const result = generatedSeanceSchema.parse({ ...validSeance, extra: "ignored" })
    expect(result).not.toHaveProperty("extra")
  })

  it("accepts empty pedagogical_note", () => {
    const result = generatedSeanceSchema.parse({ ...validSeance, pedagogical_note: "" })
    expect(result.pedagogical_note).toBe("")
  })
})

describe("visionAgentOutputSchema", () => {
  it("accepts valid output", () => {
    const result = visionAgentOutputSchema.parse({
      isValid: true,
      timetableMarkdown: "LUNDI:\n- 08:00: Maths",
    })
    expect(result.isValid).toBe(true)
    expect(result.timetableMarkdown).toBe("LUNDI:\n- 08:00: Maths")
  })

  it("rejects missing fields", () => {
    expect(() => visionAgentOutputSchema.parse({ isValid: true })).toThrow()
    expect(() => visionAgentOutputSchema.parse({ timetableMarkdown: "" })).toThrow()
  })

  it("rejects non-boolean isValid", () => {
    expect(() => visionAgentOutputSchema.parse({ isValid: "true", timetableMarkdown: "" })).toThrow()
    expect(() => visionAgentOutputSchema.parse({ isValid: 1, timetableMarkdown: "" })).toThrow()
  })

  it("accepts empty timetableMarkdown", () => {
    const result = visionAgentOutputSchema.parse({ isValid: false, timetableMarkdown: "" })
    expect(result.timetableMarkdown).toBe("")
  })
})

describe("profileAgentOutputSchema", () => {
  it("accepts valid output", () => {
    const result = profileAgentOutputSchema.parse({
      studentProfileContext: "- Weak in Maths\n- Bedtime: 22:00",
    })
    expect(result.studentProfileContext).toBe("- Weak in Maths\n- Bedtime: 22:00")
  })

  it("rejects missing studentProfileContext", () => {
    expect(() => profileAgentOutputSchema.parse({})).toThrow()
  })

  it("rejects non-string studentProfileContext", () => {
    expect(() => profileAgentOutputSchema.parse({ studentProfileContext: 42 })).toThrow()
  })

  it("accepts empty string", () => {
    const result = profileAgentOutputSchema.parse({ studentProfileContext: "" })
    expect(result.studentProfileContext).toBe("")
  })
})

describe("plannerAgentOutputSchema", () => {
  it("accepts valid output with sessions", () => {
    const result = plannerAgentOutputSchema.parse({
      sessions: [
        {
          day_of_week: "monday",
          start_time: "18:00",
          end_time: "18:45",
          subject: "Mathématiques",
          session_type: "review",
          pedagogical_note: "35 min exos, 10 min synthèse",
        },
      ],
    })
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].subject).toBe("Mathématiques")
  })

  it("accepts empty sessions array", () => {
    const result = plannerAgentOutputSchema.parse({ sessions: [] })
    expect(result.sessions).toEqual([])
  })

  it("rejects missing sessions", () => {
    expect(() => plannerAgentOutputSchema.parse({})).toThrow()
  })

  it("rejects invalid session in array", () => {
    expect(() =>
      plannerAgentOutputSchema.parse({ sessions: [{ day_of_week: "monday" }] })
    ).toThrow()
  })

  it("accepts multiple sessions", () => {
    const input = { sessions: Array.from({ length: 10 }, (_, i) => ({
      day_of_week: "monday" as const,
      start_time: "08:00",
      end_time: "08:45",
      subject: `Subject ${i}`,
      session_type: "review" as const,
      pedagogical_note: "Note",
    }))}
    const result = plannerAgentOutputSchema.parse(input)
    expect(result.sessions).toHaveLength(10)
  })
})

describe("GeneratedSeance type", () => {
  it("matches generatedSeanceSchema shape", () => {
    const seance: GeneratedSeance = {
      day_of_week: "wednesday",
      start_time: "14:00",
      end_time: "14:45",
      subject: "Physique-Chimie",
      session_type: "td",
      pedagogical_note: "TD sur les circuits",
    }
    expect(generatedSeanceSchema.parse(seance)).toEqual(seance)
  })
})

describe("PlanningGraphAnnotation", () => {
  it("has required fields declared with correct default types via annotation options", () => {
    const PLACEHOLDER = undefined
    const stateShape: Record<string, unknown> = {
      timetableImage: PLACEHOLDER,
      timetableImageMimeType: PLACEHOLDER,
      onboardingData: PLACEHOLDER,
      extractedTimetableMarkdown: PLACEHOLDER,
      studentProfileContext: PLACEHOLDER,
      subjectCoefficients: PLACEHOLDER,
      weeklyStats: PLACEHOLDER,
      isValidTimetable: PLACEHOLDER,
      validationErrorMessage: PLACEHOLDER,
      generatedPlanning: PLACEHOLDER,
    }
    expect(stateShape).toHaveProperty("timetableImage")
    expect(stateShape).toHaveProperty("timetableImageMimeType")
    expect(stateShape).toHaveProperty("onboardingData")
    expect(stateShape).toHaveProperty("extractedTimetableMarkdown")
    expect(stateShape).toHaveProperty("studentProfileContext")
    expect(stateShape).toHaveProperty("subjectCoefficients")
    expect(stateShape).toHaveProperty("weeklyStats")
    expect(stateShape).toHaveProperty("isValidTimetable")
    expect(stateShape).toHaveProperty("validationErrorMessage")
    expect(stateShape).toHaveProperty("generatedPlanning")
  })

  it("is created via Annotation.Root", () => {
    expect(PlanningGraphAnnotation).toBeDefined()
    expect(PlanningGraphAnnotation).toHaveProperty("spec")
  })

  it("has a spec with all 11 fields", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const keys = Object.keys(spec)
    expect(keys).toContain("timetableImage")
    expect(keys).toContain("timetableImageMimeType")
    expect(keys).toContain("onboardingData")
    expect(keys).toContain("extractedTimetableMarkdown")
    expect(keys).toContain("studentProfileContext")
    expect(keys).toContain("subjectCoefficients")
    expect(keys).toContain("weeklyStats")
    expect(keys).toContain("upcomingEcheances")
    expect(keys).toContain("isValidTimetable")
    expect(keys).toContain("validationErrorMessage")
    expect(keys).toContain("generatedPlanning")
    expect(keys).toHaveLength(11)
  })

  it("timetableImage uses simple Annotation (no operator, no initialValueFactory)", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.timetableImage
    expect(entry.operator).toBeUndefined()
    expect(entry.initialValueFactory).toBeUndefined()
  })

  it("timetableImageMimeType uses reducer pattern (update ?? _current)", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.timetableImageMimeType
    expect(typeof entry.operator).toBe("function")
    expect(typeof entry.initialValueFactory).toBe("function")
    expect(entry.initialValueFactory()).toBe("image/jpeg")
    expect(entry.value).toBe("image/jpeg")
    expect(entry.operator("image/png", undefined)).toBe("image/png")
    expect(entry.operator("image/png", "image/gif")).toBe("image/gif")
    expect(entry.operator("image/png", null)).toBe("image/png")
  })

  it("string fields use value reducer that replaces old with new", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const stringFields = ["extractedTimetableMarkdown", "studentProfileContext", "subjectCoefficients", "weeklyStats"]
    for (const field of stringFields) {
      const entry = spec[field]
      expect(typeof entry.operator).toBe("function")
      expect(entry.operator("old", "new")).toBe("new")
    }
  })

  it("string fields default to empty string", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const stringFields = ["extractedTimetableMarkdown", "studentProfileContext", "subjectCoefficients", "weeklyStats"]
    for (const field of stringFields) {
      const entry = spec[field]
      expect(typeof entry.initialValueFactory).toBe("function")
      expect(entry.initialValueFactory()).toBe("")
      expect(entry.value).toBe("")
    }
  })

  it("isValidTimetable replaces with update and defaults to true", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.isValidTimetable
    expect(typeof entry.operator).toBe("function")
    expect(entry.operator(true, false)).toBe(false)
    expect(entry.operator(false, true)).toBe(true)
    expect(typeof entry.initialValueFactory).toBe("function")
    expect(entry.initialValueFactory()).toBe(true)
    expect(entry.value).toBe(true)
  })

  it("validationErrorMessage replaces with update and defaults to undefined", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.validationErrorMessage
    expect(typeof entry.operator).toBe("function")
    expect(entry.operator("old error", "new error")).toBe("new error")
    expect(entry.operator("error", undefined)).toBe(undefined)
    expect(typeof entry.initialValueFactory).toBe("function")
    expect(entry.initialValueFactory()).toBeUndefined()
    expect(entry.value).toBeUndefined()
  })

  it("generatedPlanning replaces with update and defaults to empty array", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.generatedPlanning
    expect(typeof entry.operator).toBe("function")
    const old = [{ day_of_week: "monday" as const, start_time: "08:00", end_time: "09:00", subject: "Maths", session_type: "td" as const, pedagogical_note: "" }]
    const updated = [{ day_of_week: "tuesday" as const, start_time: "09:00", end_time: "10:00", subject: "Physics", session_type: "td" as const, pedagogical_note: "" }]
    expect(entry.operator(old, updated)).toBe(updated)
    expect(typeof entry.initialValueFactory).toBe("function")
    expect(entry.initialValueFactory()).toEqual([])
    expect(entry.value).toEqual([])
  })

  it("upcomingEcheances replaces with update and defaults to empty string", () => {
    const spec = (PlanningGraphAnnotation as any).spec
    const entry = spec.upcomingEcheances
    expect(typeof entry.operator).toBe("function")
    expect(entry.operator("old", "new")).toBe("new")
    expect(entry.operator("", "échéances")).toBe("échéances")
    expect(typeof entry.initialValueFactory).toBe("function")
    expect(entry.initialValueFactory()).toBe("")
    expect(entry.value).toBe("")
  })

  describe("type exports", () => {
    it("PlanningGraphAnnotationState type is valid", () => {
      const _check: PlanningGraphAnnotationState = {} as PlanningGraphAnnotationState
      expect(true).toBe(true)
    })

    it("PlanningGraphAnnotationUpdate type is valid", () => {
      const _check: PlanningGraphAnnotationUpdate = {} as PlanningGraphAnnotationUpdate
      expect(true).toBe(true)
    })
  })
})
