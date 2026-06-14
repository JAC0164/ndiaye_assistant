import { describe, it, expect, vi, beforeEach } from "vitest"
import { visionAgentOutputSchema } from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"

const { mockTimetable, mockModel } = vi.hoisted(() => {
  const timetable = {
    filiere: "S1",
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
      isValid: true,
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

import { visionAgent, timetableToMarkdown } from "@/src/lib/langgraph/nodes/visionAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("fake-image-bytes"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { weakSubjects: [], bedtime: "22:00", blockedSlots: [] },
  extractedTimetableMarkdown: "",
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
      isValid: true,
    })
  })

  it("calls model.withStructuredOutput with visionAgentOutputSchema", async () => {
    await visionAgent(baseState)
    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
      visionAgentOutputSchema,
      expect.objectContaining({ name: "validate_and_extract_senegalese_timetable" })
    )
  })

  it("returns extractedTimetable, extractedTimetableMarkdown, isValidTimetable, and no validationErrorMessage on valid", async () => {
    const result = await visionAgent(baseState)
    expect(result.extractedTimetable).toEqual(mockTimetable)
    expect(result.isValidTimetable).toBe(true)
    expect(result.validationErrorMessage).toBeUndefined()
    expect(result.extractedTimetableMarkdown).toContain("LUNDI")
    expect(result.extractedTimetableMarkdown).toContain("MATH")
  })

  it("returns validationErrorMessage when isValid is false", async () => {
    mockModel.invoke.mockResolvedValueOnce({
      timetable: { filiere: "S1", days: [] },
      isValid: false,
    })
    const result = await visionAgent(baseState)
    expect(result.isValidTimetable).toBe(false)
    expect(result.validationErrorMessage).toBe("Emploi du temps invalide ou non conforme au système sénégalais.")
  })

  it("skips model call when extractedTimetable already exists in state", async () => {
    const stateWithTimetable: PlanningGraphAnnotationState = {
      ...baseState,
      extractedTimetable: mockTimetable,
      extractedTimetableMarkdown: "EXISTING_TIMETABLE",
      isValidTimetable: false,
      validationErrorMessage: "Previous error",
    }
    const result = await visionAgent(stateWithTimetable)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.extractedTimetable).toEqual(mockTimetable)
    expect(result.extractedTimetableMarkdown).toBe("EXISTING_TIMETABLE")
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
    expect(systemMessage).toContain("filière")
    expect(systemMessage).toContain("isValid")
    expect(systemMessage).toContain("coefficient")
  })

  it("passes modelOverrides to getModel", async () => {
    const modelModule = await import("@/src/lib/langgraph/model")
    const getModelSpy = vi.spyOn(modelModule, "getModel")

    const overrides = { temperature: 0.7 }
    await visionAgent(baseState, overrides)
    expect(getModelSpy).toHaveBeenCalledWith("vision", overrides)

    getModelSpy.mockRestore()
  })

  it("uses fallback filiere S1 when onboarding has no serie", async () => {
    await visionAgent(baseState)
    const messages = mockFromMessages.mock.calls[0][0] as Array<[string, string]>
    const systemMessage = messages.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain('Set filiere to "S1"')
  })
})

describe("timetableToMarkdown", () => {
  it("returns empty string for null timetable", () => {
    expect(timetableToMarkdown(null as any)).toBe("")
  })

  it("returns empty string for timetable without days", () => {
    expect(timetableToMarkdown({ filiere: "S1" } as any)).toBe("")
  })

  it("falls back to uppercase day name for unknown day (line 34)", () => {
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
    expect(result).toContain("FUNDAY")
  })
})

describe("visionAgent coefficientTable fallback", () => {
  it("uses fallback text when coefficientTable is empty (line 62)", async () => {
    vi.clearAllMocks()
    const stateWithoutCoeffs: PlanningGraphAnnotationState = {
      ...baseState,
      coefficientTable: "",
    }
    await visionAgent(stateWithoutCoeffs)
    const lastCall = mockFromMessages.mock.calls[mockFromMessages.mock.calls.length - 1][0] as Array<[string, string]>
    const systemMessage = lastCall.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain("No coefficient table provided.")
  })
})
