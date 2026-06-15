import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/ollama"
import { logger } from "@/src/lib/logger"

import type { ModelProviderConfig } from "./types"

const ALLOWED_BASE_URLS = ["api.openai.com", "api.deepseek.com", "localhost", "127.0.0.1"]

function isAllowedBaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return ALLOWED_BASE_URLS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

function safeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (isAllowedBaseUrl(url)) return url
  logger.warn({ url }, "[Security] Blocked disallowed baseUrl for LLM provider")
  return undefined
}

export function createModel(config: ModelProviderConfig): BaseChatModel {
  const timeout = config.timeout ?? 30_000
  const maxTokens = config.maxTokens ?? 8192

  switch (config.provider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: config.model,
        temperature: config.temperature,
        maxOutputTokens: maxTokens,
      })
    case "openai":
      return new ChatOpenAI({
        model: config.model,
        temperature: config.temperature,
        maxTokens,
        timeout,
        configuration: safeBaseUrl(config.baseUrl) ? { baseURL: safeBaseUrl(config.baseUrl) } : undefined,
      })
    case "anthropic":
      return new ChatAnthropic({
        model: config.model,
        temperature: config.temperature,
        maxTokens,
      })
    case "deepseek":
      return new ChatOpenAI({
        model: config.model || "deepseek-chat",
        temperature: config.temperature,
        maxTokens,
        timeout,
        configuration: {
          baseURL: safeBaseUrl(config.baseUrl) || "https://api.deepseek.com/v1",
        },
      })
    case "ollama":
      return new ChatOllama({
        model: config.model,
        temperature: config.temperature,
        numPredict: maxTokens,
        baseUrl: safeBaseUrl(config.baseUrl) || "http://localhost:11434",
      })
    default:
      return new ChatGoogleGenerativeAI({
        model: config.model,
        temperature: config.temperature,
        maxOutputTokens: maxTokens,
      })
  }
}
