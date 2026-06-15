import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/langgraph/providers", () => ({
  getModelConfigForAgent: vi.fn(() => ({ provider: "gemini", model: "test-model", temperature: 0, maxTokens: 8192 })),
}))

vi.mock("@/src/lib/langgraph/providers/factory", () => ({
  createModel: vi.fn(),
}))

vi.mock("@/src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
  },
}))

import { getModel, createTokenLogger, resetModelCache } from "@/src/lib/langgraph/model"
import { logger } from "@/src/lib/logger"
import { getModelConfigForAgent } from "@/src/lib/langgraph/providers"
import { createModel } from "@/src/lib/langgraph/providers/factory"

describe("getModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetModelCache()
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
    const mockConfig = { provider: "gemini", model: "test-model", temperature: 0, maxTokens: 8192 }
    vi.mocked(getModelConfigForAgent).mockReturnValue(mockConfig)
    getModel("planner")
    expect(createModel).toHaveBeenCalledWith(mockConfig)
  })

  it("returns cached model instance on second call with same args", () => {
    const mockModel = { _isMock: true }
    vi.mocked(createModel).mockReturnValue(mockModel as any)
    const first = getModel("planner")
    const second = getModel("planner")
    expect(second).toBe(first)
    expect(createModel).toHaveBeenCalledTimes(1)
  })

  it("creates separate model when maxTokens differs (cache key includes maxTokens)", () => {
    const baseConfig = { provider: "gemini", model: "test-model", temperature: 0, maxTokens: 8192 }
    const altConfig = { provider: "gemini", model: "test-model", temperature: 0, maxTokens: 500 }
    vi.mocked(getModelConfigForAgent)
      .mockReturnValueOnce(baseConfig)
      .mockReturnValueOnce(altConfig)

    getModel("planner")
    getModel("planner")

    expect(createModel).toHaveBeenCalledTimes(2)
    expect(createModel).toHaveBeenNthCalledWith(1, baseConfig)
    expect(createModel).toHaveBeenNthCalledWith(2, altConfig)
  })
})

describe("createTokenLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns an object with callbacks array containing handleLLMEnd", () => {
    const result = createTokenLogger("test-agent")
    expect(result).toHaveProperty("callbacks")
    expect(Array.isArray(result.callbacks)).toBe(true)
    expect(result.callbacks).toHaveLength(1)
    expect(typeof result.callbacks[0].handleLLMEnd).toBe("function")
  })

  it("handleLLMEnd logs token usage from llmOutput.tokenUsage", () => {
    const output = {
      generations: [[{ text: "" }]],
      llmOutput: {
        tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      },
    }

    const result = createTokenLogger("test-agent")
    result.callbacks[0].handleLLMEnd(output as any)

    expect(logger.info).toHaveBeenCalledWith(
      { promptTokens: 10, completionTokens: 20, totalTokens: 30, duration: expect.any(String), agent: "test-agent" },
      "Token usage"
    )
  })

  it("handleLLMEnd logs token usage from llmOutput.estimatedTokenUsage", () => {
    const output = {
      generations: [[{ text: "" }]],
      llmOutput: {
        estimatedTokenUsage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
      },
    }

    const result = createTokenLogger("test-agent")
    result.callbacks[0].handleLLMEnd(output as any)

    expect(logger.info).toHaveBeenCalledWith(
      { promptTokens: 15, completionTokens: 25, totalTokens: 40, duration: expect.any(String), agent: "test-agent" },
      "Token usage"
    )
  })

  it("handleLLMEnd falls back to usage_metadata on the message when llmOutput has no tokenUsage", () => {
    const output = {
      generations: [
        [
          {
            text: "",
            message: {
              usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
            },
          },
        ],
      ],
      llmOutput: {},
    }

    const result = createTokenLogger("test-agent")
    result.callbacks[0].handleLLMEnd(output as any)

    expect(logger.info).toHaveBeenCalledWith(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150, duration: expect.any(String), agent: "test-agent" },
      "Token usage"
    )
  })

  it("handleLLMEnd falls back to 0 when no token usage info is available at all (lines 47-49)", () => {
    const output = {
      generations: [[{ text: "" }]],
      llmOutput: {},
    }

    const result = createTokenLogger("test-agent")
    result.callbacks[0].handleLLMEnd(output as any)

    expect(logger.info).toHaveBeenCalledWith(
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, duration: expect.any(String), agent: "test-agent" },
      "Token usage"
    )
  })

  it("handleLLMEnd falls back to promptTokens + completionTokens for totalTokens", () => {
    const output = {
      generations: [
        [
          {
            text: "",
            message: {
              usage_metadata: { input_tokens: 100, output_tokens: 50 },
            },
          },
        ],
      ],
      llmOutput: {},
    }

    const result = createTokenLogger("test-agent")
    result.callbacks[0].handleLLMEnd(output as any)

    expect(logger.info).toHaveBeenCalledWith(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150, duration: expect.any(String), agent: "test-agent" },
      "Token usage"
    )
  })
})
