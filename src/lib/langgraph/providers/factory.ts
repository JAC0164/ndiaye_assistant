import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/ollama"

import type { ModelProviderConfig } from "./types"

export function createModel(config: ModelProviderConfig): BaseChatModel {
  const timeout = config.timeout ?? 30_000

  switch (config.provider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: config.model,
        temperature: config.temperature,
      })
    case "openai":
      return new ChatOpenAI({
        model: config.model,
        temperature: config.temperature,
        timeout,
        configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
      })
    case "anthropic":
      return new ChatAnthropic({
        model: config.model,
        temperature: config.temperature,
      })
    case "deepseek":
      return new ChatOpenAI({
        model: config.model || "deepseek-chat",
        temperature: config.temperature,
        timeout,
        configuration: {
          baseURL: config.baseUrl || "https://api.deepseek.com/v1",
        },
      })
    case "ollama":
      return new ChatOllama({
        model: config.model,
        temperature: config.temperature,
        baseUrl: config.baseUrl || "http://localhost:11434",
      })
    default:
      return new ChatGoogleGenerativeAI({
        model: config.model,
        temperature: config.temperature,
      })
  }
}
