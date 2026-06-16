export type ModelProvider = "gemini" | "openai" | "anthropic" | "ollama" | "deepseek" | "groq"

export type AgentName = "vision" | "profile" | "planner"

export interface ModelProviderConfig {
  provider: ModelProvider
  model: string
  temperature: number
  maxTokens?: number
  baseUrl?: string
  timeout?: number
}

export interface ProvidersConfig {
  default: ModelProviderConfig
  agents?: Partial<Record<AgentName, Partial<ModelProviderConfig>>>
}

export function getProviderLabel(provider: ModelProvider): string {
  const labels: Record<ModelProvider, string> = {
    gemini: "Google Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    deepseek: "DeepSeek",
    ollama: "Ollama (local)",
    groq: "Groq",
  }
  return labels[provider]
}
