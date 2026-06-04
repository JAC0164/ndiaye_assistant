import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/ollama"

import type { ModelProviderConfig } from "./types"

export function createModel(config: ModelProviderConfig): BaseChatModel {
  switch (config.provider) {
    case "gemini":
      return createGeminiModel(config)
    case "openai":
      return createOpenAIModel(config)
    case "anthropic":
      return createAnthropicModel(config)
    case "deepseek":
      return createDeepSeekModel(config)
    case "ollama":
      return createOllamaModel(config)
    default:
      return createGeminiModel(config)
  }
}

function createGeminiModel(config: ModelProviderConfig): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model: config.model,
    temperature: config.temperature,
  })
}

function createOpenAIModel(config: ModelProviderConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.model,
    temperature: config.temperature,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  })
}

function createAnthropicModel(config: ModelProviderConfig): ChatAnthropic {
  return new ChatAnthropic({
    model: config.model,
    temperature: config.temperature,
  })
}

function createDeepSeekModel(config: ModelProviderConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.model || "deepseek-chat",
    temperature: config.temperature,
    configuration: {
      baseURL: config.baseUrl || "https://api.deepseek.com/v1",
    },
  })
}

function createOllamaModel(config: ModelProviderConfig): ChatOllama {
  return new ChatOllama({
    model: config.model,
    temperature: config.temperature,
    baseUrl: config.baseUrl || "http://localhost:11434",
  })
}
