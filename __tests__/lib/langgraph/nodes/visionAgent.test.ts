import { describe, it, expect, vi, beforeEach } from "vitest"
import { visionAgentOutputSchema } from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"

const mockModel = vi.hoisted(() => ({
  withStructuredOutput: vi.fn().mockReturnThis(),
  invoke: vi.fn().mockResolvedValue({
    timetableMarkdown: "LUNDI:\n- 08:00-09:30: Mathématiques\n- 09:40-11:10: Français",
    isValid: true,
  }),
  pipe: vi.fn().mockReturnThis(),
}))

const mockCreateTokenLogger = vi.hoisted(() =>
  vi.fn(() => ({ callbacks: [] }))
)

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
  createTokenLogger: mockCreateTokenLogger,
}))

vi.mock("@/src/lib/langgraph/nodes/withRetry", () => ({
  withRetry: vi.fn(
    async <T>(fn: () => Promise<T>, _agentName: string): Promise<T> => fn()
  ),
}))

import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("fake-image-bytes"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { serie: "S1" },
  extractedTimetableMarkdown: "",
  studentProfileContext: "",
  subjectCoefficients: "",
  weeklyStats: "",
  isValidTimetable: true,
  generatedPlanning: [],
}

describe("visionAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls model.withStructuredOutput with visionAgentOutputSchema", async () => {
    await visionAgent(baseState)
    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
      visionAgentOutputSchema,
      expect.objectContaining({ name: "validate_and_extract_senegalese_timetable" })
    )
  })

  it("returns extractedTimetableMarkdown, isValidTimetable, and no validationErrorMessage on valid", async () => {
    const result = await visionAgent(baseState)
    expect(result).toHaveProperty("extractedTimetableMarkdown")
    expect(result).toHaveProperty("isValidTimetable")
    expect(result.extractedTimetableMarkdown).toBe(
      "LUNDI:\n- 08:00-09:30: Mathématiques\n- 09:40-11:10: Français"
    )
    expect(result.isValidTimetable).toBe(true)
    expect(result.validationErrorMessage).toBeUndefined()
  })

  it("returns validationErrorMessage when isValid is false", async () => {
    mockModel.invoke.mockResolvedValueOnce({
      timetableMarkdown: "",
      isValid: false,
    })
    const result = await visionAgent(baseState)
    expect(result.isValidTimetable).toBe(false)
    expect(result.validationErrorMessage).toBe(
      "Emploi du temps invalide ou non conforme au système sénégalais."
    )
  })

  it("skips model call when extractedTimetableMarkdown already exists in state", async () => {
    const stateWithTimetable: PlanningGraphAnnotationState = {
      ...baseState,
      extractedTimetableMarkdown: "EXISTING_TIMETABLE",
      isValidTimetable: false,
      validationErrorMessage: "Previous error",
    }
    const result = await visionAgent(stateWithTimetable)
    expect(mockModel.invoke).not.toHaveBeenCalled()
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
    expect(callArg.imageDataUrl).toBe(
      "data:image/jpeg;base64,aGVsbG8="
    )
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
    expect(systemMessage).toContain("Agent Vision")
    expect(systemMessage).toContain("Sénégal")
    expect(systemMessage).toContain("timetableMarkdown")
    expect(systemMessage).toContain("isValid")
    expect(systemMessage).toContain("secondaire")
  })

  it("passes modelOverrides to getModel", async () => {
    const modelModule = await import("@/src/lib/langgraph/model")
    const getModelSpy = vi.spyOn(modelModule, "getModel")

    const overrides = { temperature: 0.7 }
    await visionAgent(baseState, overrides)
    expect(getModelSpy).toHaveBeenCalledWith("vision", overrides)

    getModelSpy.mockRestore()
  })

  it("creates token logger for 'vision' agent", async () => {
    await visionAgent(baseState)
    expect(mockCreateTokenLogger).toHaveBeenCalledWith("vision")
  })
})
