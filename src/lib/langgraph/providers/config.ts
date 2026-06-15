import type { AgentName, ModelProvider, ModelProviderConfig, ProvidersConfig } from "./types"

const AGENT_KEYS: AgentName[] = ["vision", "profile", "planner"]

function env(key: string): string | undefined {
  return process.env[key]
}

function resolveProviderConfig(prefix: string): Partial<ModelProviderConfig> {
  const cfg: Partial<ModelProviderConfig> = {}
  const provider = env(`${prefix}_PROVIDER`) as ModelProvider | undefined
  if (provider) cfg.provider = provider
  const model = env(`${prefix}_MODEL`)
  if (model) cfg.model = model
  const temp = env(`${prefix}_TEMPERATURE`)
  if (temp) cfg.temperature = Number(temp)
  const baseUrl = env(`${prefix}_BASE_URL`)
  if (baseUrl) cfg.baseUrl = baseUrl
  const maxTokens = env(`NDIAYE_MAX_TOKENS`)
  if (maxTokens) cfg.maxTokens = Number(maxTokens)
  return cfg
}

function loadDefaultConfig(): ModelProviderConfig {
  const overrides = resolveProviderConfig("NDIAYE_DEFAULT")
  return {
    provider: overrides.provider ?? "gemini",
    model: overrides.model ?? "gemini-2.5-flash",
    temperature: overrides.temperature ?? 0,
    maxTokens: overrides.maxTokens ?? 8192,
    baseUrl: overrides.baseUrl,
  }
}

function loadAgentConfig(name: AgentName, defaults: ModelProviderConfig): ModelProviderConfig {
  const prefix = `NDIAYE_${name.toUpperCase()}`
  const overrides = resolveProviderConfig(prefix)
  return {
    provider: overrides.provider ?? defaults.provider,
    model: overrides.model ?? defaults.model,
    temperature: overrides.temperature ?? defaults.temperature,
    maxTokens: overrides.maxTokens ?? defaults.maxTokens,
    baseUrl: overrides.baseUrl ?? defaults.baseUrl,
  }
}

function loadProvidersConfig(): ProvidersConfig {
  const defaults = loadDefaultConfig()
  const agents: ProvidersConfig["agents"] = {}
  for (const key of AGENT_KEYS) {
    agents[key] = loadAgentConfig(key, defaults)
  }
  return { default: defaults, agents }
}

let cachedConfig: ProvidersConfig | null = null

export function getConfig(): ProvidersConfig {
  if (!cachedConfig) {
    cachedConfig = loadProvidersConfig()
  }
  return cachedConfig
}

export function invalidateConfig(): void {
  cachedConfig = null
}

export function getModelConfigForAgent(
  agentName: AgentName,
  overrides?: Partial<ModelProviderConfig>
): ModelProviderConfig {
  const config = getConfig()
  const agentCfg = config.agents?.[agentName] ?? {}
  const merged: ModelProviderConfig = {
    provider: overrides?.provider ?? agentCfg.provider ?? config.default.provider,
    model: overrides?.model ?? agentCfg.model ?? config.default.model,
    temperature: overrides?.temperature ?? agentCfg.temperature ?? config.default.temperature,
    maxTokens: overrides?.maxTokens ?? agentCfg.maxTokens ?? config.default.maxTokens,
    baseUrl: overrides?.baseUrl ?? agentCfg.baseUrl ?? config.default.baseUrl,
  }
  return merged
}
