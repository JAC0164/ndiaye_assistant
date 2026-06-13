import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/langgraph/providers", () => ({
  getModelConfigForAgent: vi.fn(),
}))

vi.mock("@/src/lib/langgraph/providers/factory", () => ({
  createModel: vi.fn(),
}))

import { getModel } from "@/src/lib/langgraph/model"
import { getModelConfigForAgent } from "@/src/lib/langgraph/providers"
import { createModel } from "@/src/lib/langgraph/providers/factory"

describe("getModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses default agent 'planner' when called without arguments", () => {
    getModel()
    expect(getModelConfigForAgent).toHaveBeenCalledWith("planner", undefined)
  })

  it("passes agentName to getModelConfigForAgent", () => {
    getModel("vision")
    expect(getModelConfigForAgent).toHaveBeenCalledWith("vision", undefined)
  })

  it("passes overrides to getModelConfigForAgent", () => {
    const overrides = { temperature: 0.5 }
    getModel("planner", overrides)
    expect(getModelConfigForAgent).toHaveBeenCalledWith("planner", overrides)
  })

  it("returns a BaseChatModel from factory", () => {
    const mockModel = { _isMock: true }
    vi.mocked(createModel).mockReturnValue(mockModel as any)
    const result = getModel()
    expect(result).toBe(mockModel)
  })

  it("passes config from getModelConfigForAgent to createModel", () => {
    const mockConfig = { provider: "gemini", model: "test-model", temperature: 0 }
    vi.mocked(getModelConfigForAgent).mockReturnValue(mockConfig)
    getModel("planner")
    expect(createModel).toHaveBeenCalledWith(mockConfig)
  })
})


