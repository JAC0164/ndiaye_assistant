import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/langgraph/providers", () => ({
  getModelConfigForAgent: vi.fn(),
}))

vi.mock("@/src/lib/langgraph/providers/factory", () => ({
  createModel: vi.fn(),
}))

import { getModel, createTokenLogger } from "@/src/lib/langgraph/model"
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

describe("createTokenLogger", () => {
  it("returns an object with callbacks array", () => {
    const logger = createTokenLogger("test")
    expect(logger).toHaveProperty("callbacks")
    expect(Array.isArray(logger.callbacks)).toBe(true)
    expect(logger.callbacks).toHaveLength(1)
  })

  it("callback has handleLLMEnd method", () => {
    const logger = createTokenLogger("test")
    expect(logger.callbacks[0]).toHaveProperty("handleLLMEnd")
    expect(typeof logger.callbacks[0].handleLLMEnd).toBe("function")
  })

  it("handleLLMEnd logs token usage from llmOutput.tokenUsage", () => {
    const logger = createTokenLogger("planner")
    const output = {
      llmOutput: {
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      },
      generations: [[{ message: {} }]],
    }
    expect(() => logger.callbacks[0].handleLLMEnd(output as any)).not.toThrow()
  })

  it("handleLLMEnd falls back to message.usage_metadata when llmOutput has no tokenUsage", () => {
    const logger = createTokenLogger("vision")
    const output = {
      llmOutput: {},
      generations: [[{
        message: { usage_metadata: { input_tokens: 5, output_tokens: 15, total_tokens: 20 } },
      }]],
    }
    expect(() => logger.callbacks[0].handleLLMEnd(output as any)).not.toThrow()
  })

  it("handleLLMEnd falls back to 0 when no token data available", () => {
    const logger = createTokenLogger("profile")
    const output = {
      llmOutput: {},
      generations: [[{ message: {} }]],
    }
    expect(() => logger.callbacks[0].handleLLMEnd(output as any)).not.toThrow()
  })

  it("handleLLMEnd handles estimatedTokenUsage as fallback", () => {
    const logger = createTokenLogger("test")
    const output = {
      llmOutput: {
        estimatedTokenUsage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      },
      generations: [[{ message: {} }]],
    }
    expect(() => logger.callbacks[0].handleLLMEnd(output as any)).not.toThrow()
  })
})
