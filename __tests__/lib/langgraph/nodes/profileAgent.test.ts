import { describe, it, expect } from "vitest"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"
import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("img"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { weakSubjects: ["Mathématiques", "Physique"], blockedSlots: [], bedtime: "22:00" },
  timetableSummary: "",
  studentProfileContext: "",
  isValidTimetable: true,
  generatedPlanning: [],
  coefficientTable: "",
  extractedTimetable: null,
  preplannerConstraints: "",
  planningValidation: null,
}

describe("profileAgent (Deterministic)", () => {
  it("skips calculations and returns studentProfileContext if it already exists in the state", async () => {
    const stateWithProfile: PlanningGraphAnnotationState = {
      ...baseState,
      studentProfileContext: "ALREADY_EXISTING_CONTEXT",
    }
    const result = await profileAgent(stateWithProfile)
    expect(result.studentProfileContext).toBe("ALREADY_EXISTING_CONTEXT")
  })

  it("handles null or undefined onboardingData gracefully", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: null,
    }
    const result = await profileAgent(state)
    expect(result.studentProfileContext).not.toContain("- **Weak subjects**")
    expect(result.studentProfileContext).not.toContain("- **Curfew**")
    expect(result.studentProfileContext).not.toContain("- **Blocked slots**")
    expect(result.studentProfileContext).toContain("- **Track**: Science (S1/S2 assumed)")
  })

  it("formats weak subjects properly when empty or populated", async () => {
    // Populated weak subjects
    const statePopulated: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: ["Mathématiques", "Physique"],
        bedtime: "22:00",
        blockedSlots: [],
      },
    }
    const resultPopulated = await profileAgent(statePopulated)
    expect(resultPopulated.studentProfileContext).toContain(
      "- **Weak subjects**: Mathématiques, Physique → reinforcement priority"
    )

    // Empty weak subjects
    const stateEmpty: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "22:00",
        blockedSlots: [],
      },
    }
    const resultEmpty = await profileAgent(stateEmpty)
    expect(resultEmpty.studentProfileContext).not.toContain("- **Weak subjects**")
  })

  it("formats bedtime time string correctly", async () => {
    // Standard HH:MM
    const stateStandard: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "21:30",
        blockedSlots: [],
      },
    }
    const resultStandard = await profileAgent(stateStandard)
    expect(resultStandard.studentProfileContext).toContain("- **Curfew**: until 21h30 max → no study after")

    // Empty bedtime → no curfew line
    const stateEmpty: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "",
        blockedSlots: [],
      },
    }
    const resultEmpty = await profileAgent(stateEmpty)
    expect(resultEmpty.studentProfileContext).not.toContain("- **Curfew**")

    // Null bedtime → no curfew line
    const stateNull: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: null as any,
        blockedSlots: [],
      },
    }
    const resultNull = await profileAgent(stateNull)
    expect(resultNull.studentProfileContext).not.toContain("- **Curfew**")

    // Bedtime that is already formatted or other string
    const stateCustom: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "22h30",
        blockedSlots: [],
      },
    }
    const resultCustom = await profileAgent(stateCustom)
    expect(resultCustom.studentProfileContext).toContain("- **Curfew**: until 22h30 max → no study after")
  })

  it("formats blocked slots correctly, displaying weekdays in English and stripping trailing :00", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "22:00",
        blockedSlots: [
          {
            id: "1",
            day: "tuesday",
            startTime: "18:00",
            endTime: "20:00",
            reason: "Cours du soir",
          },
          {
            id: "2",
            day: "thursday",
            startTime: "18:30",
            endTime: "20:15",
            reason: "Cours d'anglais",
          },
        ],
      },
    }
    const result = await profileAgent(state)
    expect(result.studentProfileContext).toContain(
      "- **Blocked slots**: Tuesday 18h-20h (Cours du soir), Thursday 18h30-20h15 (Cours d'anglais)"
    )
  })

  it("formats blocked slots correctly even with custom, empty, or unmapped day/reason/times", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: {
        weakSubjects: [],
        bedtime: "22:00",
        blockedSlots: [
          {
            id: "1",
            day: "CustomDay" as any,
            startTime: "18h00",
            endTime: "20h00",
            reason: "",
          },
          {
            id: "2",
            day: undefined as any,
            startTime: "",
            endTime: "",
            reason: "no times or day",
          },
        ],
      },
    }
    const result = await profileAgent(state)
    expect(result.studentProfileContext).toContain("- **Blocked slots**: CustomDay 18h00-20h00,  - (no times or day)")
  })

  describe("Track / Piste detection", () => {
    it("defaults to Science (S1/S2 assumed) when no humanities indicators are present", async () => {
      const result = await profileAgent(baseState)
      expect(result.studentProfileContext).toContain("- **Track**: Science (S1/S2 assumed)")
    })

    it("detects Humanities (L1/L2 assumed) when onboarding.serie contains L1", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          ...(baseState.onboardingData as any),
          serie: "L1",
        },
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("detects Humanities (L1/L2 assumed) when class_name or className matches L indicators", async () => {
      const state1: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          ...(baseState.onboardingData as any),
          class_name: "Terminale L2",
        },
      }
      const result1 = await profileAgent(state1)
      expect(result1.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")

      const state2: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          ...(baseState.onboardingData as any),
          className: "L'",
        },
      }
      const result2 = await profileAgent(state2)
      expect(result2.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("detects Humanities (L1/L2 assumed) when series_name or seriesName matches L indicators", async () => {
      const state1: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          ...(baseState.onboardingData as any),
          series_name: "L1",
        },
      }
      const result1 = await profileAgent(state1)
      expect(result1.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")

      const state2: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          ...(baseState.onboardingData as any),
          seriesName: "L2",
        },
      }
      const result2 = await profileAgent(state2)
      expect(result2.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("detects Humanities (L1/L2 assumed) when coefficientTable contains L indicators", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        coefficientTable: "- L1_coef: 3\n- FR: 4",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("detects Humanities (L1/L2 assumed) via classSeriesName from DB", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        classSeriesName: "L",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("detects Humanities via coefficient heuristic (FR > MATH)", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        coefficientTable: "- FR: 4\n- HG: 3\n- MATH: 2\n- PC: 1",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("invalidates cache and regenerates when classSeriesName contradicts cached profile (Humanities → Science)", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        studentProfileContext: "- **Track**: Science (S1/S2 assumed)",
        classSeriesName: "L",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("invalidates cache and regenerates when classSeriesName contradicts cached profile (Science → Humanities)", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        studentProfileContext: "- **Track**: Humanities (L1/L2 assumed)",
        classSeriesName: "S1",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Science (S1/S2 assumed)")
    })

    it("correctly identifies SECONDE L as Humanities and does not invalidate Humanities cache", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        studentProfileContext: "- **Track**: Humanities (L1/L2 assumed)",
        classSeriesName: "SECONDE L",
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toBe("- **Track**: Humanities (L1/L2 assumed)")
    })

    it("correctly identifies SECONDE L as Humanities when profiling deterministically", async () => {
      const state: PlanningGraphAnnotationState = {
        ...baseState,
        onboardingData: {
          class_name: "SECONDE L",
        },
      }
      const result = await profileAgent(state)
      expect(result.studentProfileContext).toContain("- **Track**: Humanities (L1/L2 assumed)")
    })
  })
})
