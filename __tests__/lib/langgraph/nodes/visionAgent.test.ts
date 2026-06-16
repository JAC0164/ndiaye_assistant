import { describe, it, expect, vi, beforeEach } from "vitest"
import { visionAgentOutputSchema } from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"

const { mockTimetable, mockModel } = vi.hoisted(() => {
  const timetable = {
    days: [
      {
        day: "monday" as const,
        slots: [
          { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
          { start: "09:40", end: "11:10", subject: "FR", coefficient: 5, subject_type: "literary" as const },
        ],
      },
    ],
  }
  const model = {
    withStructuredOutput: vi.fn().mockReturnThis(),
    invoke: vi.fn().mockResolvedValue({
      timetable,
    }),
    pipe: vi.fn().mockReturnThis(),
  }
  return { mockTimetable: timetable, mockModel: model }
})

const mockFromMessages = vi.hoisted(() =>
  vi.fn(() => ({
    pipe: vi.fn(() => mockModel),
  }))
)

vi.mock("@langchain/core/prompts", () => ({
  ChatPromptTemplate: {
    fromMessages: mockFromMessages,
  },
}))

vi.mock("@/src/lib/langgraph/model", () => ({
  getModel: vi.fn(() => mockModel),
  createTokenLogger: vi.fn(() => ({ callbacks: [] })),
}))

vi.mock("@/src/lib/langgraph/nodes/withRetry", () => ({
  withRetry: vi.fn(async <T>(fn: () => Promise<T>, _agentName: string): Promise<T> => fn()),
}))

import { visionAgent, timetableToMarkdown, validateExtractedTimetable } from "@/src/lib/langgraph/nodes/visionAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("fake-image-bytes"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { weakSubjects: [], bedtime: "22:00", blockedSlots: [] },
  timetableSummary: "",
  studentProfileContext: "",
  weeklyStats: "",
  upcomingEcheances: "",
  isValidTimetable: true,
  generatedPlanning: [],
  extractedTimetable: null,
  coefficientTable: "MATH: 4, FR: 5",
  preplannerConstraints: "",
  planningValidation: null,
}

describe("visionAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockModel.invoke.mockResolvedValue({
      timetable: mockTimetable,
    })
  })

  describe("validateExtractedTimetable", () => {
    const validDay = {
      day: "monday" as const,
      slots: [{ start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const }],
    }

    it("returns isValid:true for a valid timetable", () => {
      const result = validateExtractedTimetable({ days: [validDay] })
      expect(result.isValid).toBe(true)
    })

    it("returns invalid when a slot starts before 08:00", () => {
      const result = validateExtractedTimetable({
        days: [
          {
            day: "monday" as const,
            slots: [
              { start: "07:30", end: "09:00", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
            ],
          },
        ],
      })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("08:00")
    })

    it("returns invalid when a slot ends after 19:00", () => {
      const result = validateExtractedTimetable({
        days: [
          {
            day: "monday" as const,
            slots: [
              { start: "18:00", end: "19:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
            ],
          },
        ],
      })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("08:00")
    })

    it("returns invalid when same subject exceeds 3h consecutively", () => {
      const result = validateExtractedTimetable({
        days: [
          {
            day: "monday" as const,
            slots: [
              { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              { start: "11:20", end: "12:50", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
            ],
          },
        ],
      })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("3 consecutive hours")
    })

    it("returns invalid when all days have no slots", () => {
      const result = validateExtractedTimetable({
        days: [{ day: "monday" as const, slots: [] }],
      })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("No slots extracted.")
    })

    it("returns invalid when days array is empty", () => {
      const result = validateExtractedTimetable({ days: [] })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("No slots extracted.")
    })

    it("returns invalid when days is undefined", () => {
      const result = validateExtractedTimetable({})
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("No slots extracted.")
    })

    it("returns invalid when days is null", () => {
      const result = validateExtractedTimetable({ days: null as unknown as [] })
      expect(result.isValid).toBe(false)
      expect(result.errorMessage).toContain("No slots extracted.")
    })

    it("passes consecutive same-subject slots within 3h (exercise line 38)", () => {
      const result = validateExtractedTimetable({
        days: [
          {
            day: "monday" as const,
            slots: [
              { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
              { start: "09:40", end: "11:10", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
            ],
          },
        ],
      })
      expect(result.isValid).toBe(true)
    })
  })

  it("calls model.withStructuredOutput with visionAgentOutputSchema", async () => {
    await visionAgent(baseState)
    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
      visionAgentOutputSchema,
      expect.objectContaining({ name: "validate_and_extract_senegalese_timetable" })
    )
  })

  it("returns extractedTimetable, timetableSummary, isValidTimetable, and no validationErrorMessage on valid", async () => {
    const result = await visionAgent(baseState)
    expect(result.extractedTimetable).toEqual(mockTimetable)
    expect(result.isValidTimetable).toBe(true)
    expect(result.validationErrorMessage).toBeUndefined()
    expect(result.timetableSummary).toContain("Mon")
    expect(result.timetableSummary).toContain("MATH")
  })

  it("returns validationErrorMessage when LLM returns null timetable", async () => {
    mockModel.invoke.mockResolvedValueOnce({
      timetable: null,
    })
    const result = await visionAgent(baseState)
    expect(result.isValidTimetable).toBe(false)
    expect(result.validationErrorMessage).toBe("Failed to extract the timetable.")
  })

  it("returns validationErrorMessage when timetable fails code validation", async () => {
    mockModel.invoke.mockResolvedValueOnce({
      timetable: {
        filiere: "S1",
        days: [
          {
            day: "monday" as const,
            slots: [
              { start: "08:00", end: "12:00", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
            ],
          },
        ],
      },
    })
    const result = await visionAgent(baseState)
    expect(result.isValidTimetable).toBe(false)
    expect(result.validationErrorMessage).toContain("3 consecutive hours")
  })

  it("skips model call when extractedTimetable already exists in state", async () => {
    const stateWithTimetable: PlanningGraphAnnotationState = {
      ...baseState,
      extractedTimetable: mockTimetable,
      timetableSummary: "EXISTING_TIMETABLE",
      isValidTimetable: false,
      validationErrorMessage: "Previous error",
    }
    const result = await visionAgent(stateWithTimetable)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.extractedTimetable).toEqual(mockTimetable)
    expect(result.timetableSummary).toBe("EXISTING_TIMETABLE")
    expect(result.isValidTimetable).toBe(false)
    expect(result.validationErrorMessage).toBe("Previous error")
  })

  it("converts Buffer timetableImage to base64 data URL for the prompt", async () => {
    const buffer = Buffer.from("hello")
    const stateWithBuffer: PlanningGraphAnnotationState = {
      ...baseState,
      timetableImage: buffer,
    }
    await visionAgent(stateWithBuffer)
    const callArg = mockModel.invoke.mock.calls[0][0] as { imageDataUrl: string }
    expect(callArg.imageDataUrl).toBe("data:image/jpeg;base64,aGVsbG8=")
  })

  it("passes string timetableImage with existing data URL prefix directly", async () => {
    const existingDataUrl = "data:image/png;base64,abc123"
    const stateWithString: PlanningGraphAnnotationState = {
      ...baseState,
      timetableImage: existingDataUrl,
      timetableImageMimeType: "image/png",
    }
    await visionAgent(stateWithString)
    const callArg = mockModel.invoke.mock.calls[0][0] as { imageDataUrl: string }
    expect(callArg.imageDataUrl).toBe(existingDataUrl)
  })

  it("wraps plain string in data URL when it does not start with data:image/", async () => {
    const stateWithString: PlanningGraphAnnotationState = {
      ...baseState,
      timetableImage: "rawbase64==",
    }
    await visionAgent(stateWithString)
    const callArg = mockModel.invoke.mock.calls[0][0] as { imageDataUrl: string }
    expect(callArg.imageDataUrl).toBe("data:image/jpeg;base64,rawbase64==")
  })

  it("uses default mime type image/jpeg when none provided", async () => {
    const buffer = Buffer.from("test")
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      timetableImage: buffer,
      timetableImageMimeType: "image/jpeg",
    }
    await visionAgent(state)
    const callArg = mockModel.invoke.mock.calls[0][0] as { imageDataUrl: string }
    expect(callArg.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })

  it("includes Senegalese system instructions in the prompt", async () => {
    await visionAgent(baseState)
    const messages = mockFromMessages.mock.calls[0][0] as Array<[string, string]>
    const systemMessage = messages.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain("Vision Agent")
    expect(systemMessage).toContain("coefficient")
  })
})

describe("timetableToMarkdown", () => {
  it("returns empty string for null timetable", () => {
    expect(timetableToMarkdown(null as any)).toBe("")
  })

  it("returns empty string for timetable without days", () => {
    expect(timetableToMarkdown({} as any)).toBe("")
  })

  it("falls back to first 3 chars for unknown day", () => {
    const timetable = {
      filiere: "S1",
      days: [
        {
          day: "funday",
          slots: [
            { start: "08:00", end: "09:30", subject: "MATH", coefficient: 4, subject_type: "scientific" as const },
          ],
        },
      ],
    }
    const result = timetableToMarkdown(timetable)
    expect(result).toContain("fun")
  })
})

describe("visionAgent coefficientTable fallback", () => {
  it("skips COEFFICIENT TABLE section when coefficientTable is empty", async () => {
    vi.clearAllMocks()
    const stateWithoutCoeffs: PlanningGraphAnnotationState = {
      ...baseState,
      coefficientTable: "",
    }
    await visionAgent(stateWithoutCoeffs)
    const lastCall = mockFromMessages.mock.calls[mockFromMessages.mock.calls.length - 1][0] as Array<[string, string]>
    const systemMessage = lastCall.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).not.toContain("COEFFICIENT TABLE")
  })
})
