import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ModelProviderConfig } from "@/src/lib/langgraph/providers/types"

const mockChatGoogleGenerativeAI = vi.hoisted(() => vi.fn())
const mockChatOpenAI = vi.hoisted(() => vi.fn())
const mockChatAnthropic = vi.hoisted(() => vi.fn())
const mockChatOllama = vi.hoisted(() => vi.fn())
const mockChatGroq = vi.hoisted(() => vi.fn())

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: mockChatGoogleGenerativeAI,
}))

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: mockChatOpenAI,
}))

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: mockChatAnthropic,
}))

vi.mock("@langchain/ollama", () => ({
  ChatOllama: mockChatOllama,
}))

vi.mock("@langchain/groq", () => ({
  ChatGroq: mockChatGroq,
}))

import { createModel } from "@/src/lib/langgraph/providers/factory"
import { logger } from "@/src/lib/logger"

function makeConfig(overrides: Partial<ModelProviderConfig> = {}): ModelProviderConfig {
  return {
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0,
    timeout: 30000,
    ...overrides,
  }
}

describe("createModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ChatGoogleGenerativeAI for 'gemini' provider", () => {
    const config = makeConfig({ provider: "gemini", model: "gemini-2.5-flash", temperature: 0 })

    createModel(config)

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      temperature: 0,
      maxOutputTokens: 8192,
    })
    expect(mockChatOpenAI).not.toHaveBeenCalled()
    expect(mockChatAnthropic).not.toHaveBeenCalled()
    expect(mockChatOllama).not.toHaveBeenCalled()
  })

  it("returns ChatOpenAI for 'openai' provider with baseUrl in configuration", () => {
    const config = makeConfig({
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
      timeout: 15000,
      baseUrl: "https://api.openai.com/v1/custom",
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 8192,
      timeout: 15000,
      configuration: { baseURL: "https://api.openai.com/v1/custom" },
    })
  })

  it("does not include configuration.baseURL for OpenAI when baseUrl is not set", () => {
    const config = makeConfig({
      provider: "openai",
      model: "gpt-4",
      temperature: 0,
      baseUrl: undefined,
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "gpt-4",
      temperature: 0,
      maxTokens: 8192,
      timeout: 30000,
      configuration: undefined,
    })
  })

  it("returns ChatAnthropic for 'anthropic' provider", () => {
    const config = makeConfig({
      provider: "anthropic",
      model: "claude-3-opus-20240229",
      temperature: 0.3,
    })

    createModel(config)

    expect(mockChatAnthropic).toHaveBeenCalledWith({
      model: "claude-3-opus-20240229",
      temperature: 0.3,
      maxTokens: 8192,
    })
  })

  it("returns ChatOpenAI with DeepSeek base URL for 'deepseek' provider", () => {
    const config = makeConfig({
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.5,
      timeout: 60000,
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "deepseek-chat",
      temperature: 0.5,
      maxTokens: 8192,
      timeout: 60000,
      configuration: {
        baseURL: "https://api.deepseek.com/v1",
      },
    })
  })

  it("uses default model 'deepseek-chat' when deepseek provider has no model set", () => {
    const config = makeConfig({
      provider: "deepseek",
      model: undefined as unknown as string,
      temperature: 0,
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-chat",
      })
    )
  })

  it("uses custom base URL for DeepSeek when provided", () => {
    const config = makeConfig({
      provider: "deepseek",
      model: "deepseek-coder",
      temperature: 0,
      baseUrl: "https://api.deepseek.com/v1/custom",
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { baseURL: "https://api.deepseek.com/v1/custom" },
      })
    )
  })

  it("returns ChatOllama for 'ollama' provider", () => {
    const config = makeConfig({
      provider: "ollama",
      model: "llama3",
      temperature: 0.8,
    })

    createModel(config)

    expect(mockChatOllama).toHaveBeenCalledWith({
      model: "llama3",
      temperature: 0.8,
      numPredict: 8192,
      baseUrl: "http://localhost:11434",
    })
  })

  it("uses custom base URL for Ollama when provided", () => {
    const config = makeConfig({
      provider: "ollama",
      model: "mistral",
      temperature: 0,
      baseUrl: "http://localhost:11434/custom",
    })

    createModel(config)

    expect(mockChatOllama).toHaveBeenCalledWith({
      model: "mistral",
      temperature: 0,
      numPredict: 8192,
      baseUrl: "http://localhost:11434/custom",
    })
  })

  it("returns ChatGroq for 'groq' provider", () => {
    const config = makeConfig({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
    })

    createModel(config)

    expect(mockChatGroq).toHaveBeenCalledWith({
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      maxTokens: 8192,
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: undefined,
    })
  })

  it("uses custom base URL for Groq when provided", () => {
    const config = makeConfig({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      baseUrl: "https://api.groq.com/v1/custom",
    })

    createModel(config)

    expect(mockChatGroq).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.groq.com/v1/custom",
      })
    )
  })

  it("falls back to ChatGoogleGenerativeAI for unknown provider", () => {
    const config = makeConfig({
      provider: "unknown" as any,
      model: "some-model",
      temperature: 0.1,
    })

    createModel(config)

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: "some-model",
      temperature: 0.1,
      maxOutputTokens: 8192,
    })
  })

  it("uses default timeout of 30s when not specified", () => {
    const config = makeConfig({ provider: "openai", timeout: undefined })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30000 }))
  })

  it("passes custom timeout to model constructor", () => {
    const config = makeConfig({ provider: "openai", timeout: 120000 })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({ timeout: 120000 }))
  })

  it("does not pass timeout to Gemini (ChatGoogleGenerativeAI has no timeout param)", () => {
    const config = makeConfig({ provider: "gemini", timeout: 99999 })

    createModel(config)

    expect(mockChatGoogleGenerativeAI).toHaveBeenCalledWith({
      model: "gemini-2.5-flash",
      temperature: 0,
      maxOutputTokens: 8192,
    })
    expect(mockChatGoogleGenerativeAI.mock.calls[0][0]).not.toHaveProperty("timeout")
  })

  it("handles invalid baseUrl that triggers catch block in isAllowedBaseUrl", () => {
    const config = makeConfig({
      provider: "openai",
      model: "gpt-4",
      baseUrl: "not-a-valid-url",
    })

    createModel(config)

    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "gpt-4",
      temperature: 0,
      maxTokens: 8192,
      timeout: 30000,
      configuration: undefined,
    })
  })

  it("blocks disallowed baseUrl, logs warning, and returns undefined from safeBaseUrl", () => {
    const loggerSpy = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const config = makeConfig({
      provider: "openai",
      model: "gpt-4",
      baseUrl: "https://evil-site.com/api",
    })

    createModel(config)

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://evil-site.com/api" }),
      "[Security] Blocked disallowed baseUrl for LLM provider"
    )
    expect(mockChatOpenAI).toHaveBeenCalledWith({
      model: "gpt-4",
      temperature: 0,
      maxTokens: 8192,
      timeout: 30000,
      configuration: undefined,
    })
    loggerSpy.mockRestore()
  })
})
