import { describe, it, expect, vi, beforeEach } from "vitest"
import { profileAgentOutputSchema } from "@/src/lib/langgraph/state"
import type { PlanningGraphAnnotationState } from "@/src/lib/langgraph/state"

const mockModel = vi.hoisted(() => ({
  withStructuredOutput: vi.fn().mockReturnThis(),
  invoke: vi.fn().mockResolvedValue({
    studentProfileContext: "- Maths: besoin de renforcement\n- Couvre-feu: 22:00",
  }),
  pipe: vi.fn().mockReturnThis(),
}))

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

import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"

const baseState: PlanningGraphAnnotationState = {
  timetableImage: Buffer.from("img"),
  timetableImageMimeType: "image/jpeg",
  onboardingData: { weakSubjects: ["Maths"], blockedSlots: [], bedtime: "22:00" },
  timetableSummary: "",
  studentProfileContext: "",
  weeklyStats: "",
  isValidTimetable: true,
  generatedPlanning: [],
}

describe("profileAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls model.withStructuredOutput with profileAgentOutputSchema", async () => {
    await profileAgent(baseState)
    expect(mockModel.withStructuredOutput).toHaveBeenCalledWith(
      profileAgentOutputSchema,
      expect.objectContaining({ name: "analyze_student_learning_profile" })
    )
  })

  it("returns studentProfileContext from model output", async () => {
    const result = await profileAgent(baseState)
    expect(result).toHaveProperty("studentProfileContext")
    expect(result.studentProfileContext).toBe("- Maths: besoin de renforcement\n- Couvre-feu: 22:00")
  })

  it("skips model call when studentProfileContext already exists in state", async () => {
    const stateWithProfile: PlanningGraphAnnotationState = {
      ...baseState,
      studentProfileContext: "EXISTING_PROFILE_CONTEXT",
    }
    const result = await profileAgent(stateWithProfile)
    expect(mockModel.invoke).not.toHaveBeenCalled()
    expect(result.studentProfileContext).toBe("EXISTING_PROFILE_CONTEXT")
  })

  it("passes onboarding data as JSON to the model input", async () => {
    const onboardingData = { weakSubjects: ["Philo", "Anglais"], bedtime: "22:00", blockedSlots: [] }
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData,
    }
    await profileAgent(state)
    const callArg = mockModel.invoke.mock.calls[0][0] as { onboardingDataJson: string }
    expect(callArg.onboardingDataJson).toBe(JSON.stringify(onboardingData))
  })

  it("includes student profile instructions in the system prompt", async () => {
    await profileAgent(baseState)
    const messages = mockFromMessages.mock.calls[0][0] as Array<[string, string]>
    const systemMessage = messages.find(([role]) => role === "system")?.[1] ?? ""
    expect(systemMessage).toContain("Profile Agent")
    expect(systemMessage).toContain("weakSubjects")
    expect(systemMessage).toContain("blockedSlots")
    expect(systemMessage).toContain("studentProfileContext")
  })

  it("handles empty onboarding data gracefully", async () => {
    const state: PlanningGraphAnnotationState = {
      ...baseState,
      onboardingData: null,
    }
    await profileAgent(state)
    const callArg = mockModel.invoke.mock.calls[0][0] as { onboardingDataJson: string }
    expect(callArg.onboardingDataJson).toBe("null")
  })
})
