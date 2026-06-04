export type ModelProvider = "gemini" | "openai" | "anthropic" | "ollama" | "deepseek"

export type AgentName = "vision" | "profile" | "planner"

export interface ModelProviderConfig {
  provider: ModelProvider
  model: string
  temperature: number
  baseUrl?: string
}

export interface ProvidersConfig {
  default: ModelProviderConfig
  agents?: Partial<Record<AgentName, Partial<ModelProviderConfig>>>
}

export interface ModelOverrides {
  vision?: Partial<ModelProviderConfig>
  profile?: Partial<ModelProviderConfig>
  planner?: Partial<ModelProviderConfig>
}

export function getProviderLabel(provider: ModelProvider): string {
  const labels: Record<ModelProvider, string> = {
    gemini: "Google Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    deepseek: "DeepSeek",
    ollama: "Ollama (local)",
  }
  return labels[provider]
}
