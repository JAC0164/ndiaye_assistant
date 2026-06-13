import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getConfig, getModelConfigForAgent, invalidateConfig } from "@/src/lib/langgraph/providers/config"
import type { AgentName } from "@/src/lib/langgraph/providers/types"

describe("config", () => {
  beforeEach(() => {
    invalidateConfig()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    invalidateConfig()
  })

  it("returns default values when no env vars are set", () => {
    const config = getConfig()
    expect(config.default.provider).toBe("gemini")
    expect(config.default.model).toBe("gemini-2.5-flash")
    expect(config.default.temperature).toBe(0)
    expect(config.default.baseUrl).toBeUndefined()
  })

  it("reads NDIAYE_DEFAULT_PROVIDER, NDIAYE_DEFAULT_MODEL, NDIAYE_DEFAULT_TEMPERATURE", () => {
    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "openai")
    vi.stubEnv("NDIAYE_DEFAULT_MODEL", "gpt-4")
    vi.stubEnv("NDIAYE_DEFAULT_TEMPERATURE", "0.5")
    invalidateConfig()

    const config = getConfig()
    expect(config.default.provider).toBe("openai")
    expect(config.default.model).toBe("gpt-4")
    expect(config.default.temperature).toBe(0.5)
  })

  it("reads NDIAYE_DEFAULT_BASE_URL", () => {
    vi.stubEnv("NDIAYE_DEFAULT_BASE_URL", "https://custom.api.com/v1")
    invalidateConfig()

    const config = getConfig()
    expect(config.default.baseUrl).toBe("https://custom.api.com/v1")
  })

  it("reads per-agent overrides from NDIAYE_VISION_* env vars", () => {
    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "gemini")
    vi.stubEnv("NDIAYE_VISION_PROVIDER", "anthropic")
    vi.stubEnv("NDIAYE_VISION_MODEL", "claude-3-opus")
    vi.stubEnv("NDIAYE_VISION_TEMPERATURE", "0.2")
    invalidateConfig()

    const config = getConfig()
    expect(config.agents.vision!.provider).toBe("anthropic")
    expect(config.agents.vision!.model).toBe("claude-3-opus")
    expect(config.agents.vision!.temperature).toBe(0.2)
  })

  it("per-agent config falls back to defaults when no overrides are set", () => {
    invalidateConfig()

    const config = getConfig()
    expect(config.agents.vision!.provider).toBe("gemini")
    expect(config.agents.vision!.model).toBe("gemini-2.5-flash")
  })

  it("getModelConfigForAgent returns merged config with overrides taking precedence", () => {
    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "openai")
    vi.stubEnv("NDIAYE_DEFAULT_MODEL", "gpt-4")
    invalidateConfig()

    const result = getModelConfigForAgent("vision")
    expect(result.provider).toBe("openai")
    expect(result.model).toBe("gpt-4")
  })

  it("getModelConfigForAgent applies runtime overrides on top of env config", () => {
    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "openai")
    vi.stubEnv("NDIAYE_DEFAULT_MODEL", "gpt-4")
    invalidateConfig()

    const result = getModelConfigForAgent("planner", {
      temperature: 0.8,
      provider: "anthropic",
    })
    expect(result.provider).toBe("anthropic")
    expect(result.model).toBe("gpt-4")
    expect(result.temperature).toBe(0.8)
  })

  it("getModelConfigForAgent falls back through overrides -> agent -> default chain", () => {
    const result = getModelConfigForAgent("profile", { baseUrl: "http://localhost" })
    expect(result.provider).toBe("gemini")
    expect(result.model).toBe("gemini-2.5-flash")
    expect(result.temperature).toBe(0)
    expect(result.baseUrl).toBe("http://localhost")
  })

  it("invalidates config cache so subsequent calls re-read env vars", () => {
    const config1 = getConfig()
    expect(config1.default.provider).toBe("gemini")

    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "ollama")
    invalidateConfig()

    const config2 = getConfig()
    expect(config2.default.provider).toBe("ollama")
    vi.unstubAllEnvs()
    invalidateConfig()
  })

  it("caches config between calls without invalidation", () => {
    const _config1 = getConfig()

    vi.stubEnv("NDIAYE_DEFAULT_PROVIDER", "deepseek")
    const config2 = getConfig()
    expect(config2.default.provider).toBe("gemini")
    vi.unstubAllEnvs()
  })

  it("handles NDIAYE_PROFILE_* and NDIAYE_PLANNER_* agent env vars", () => {
    vi.stubEnv("NDIAYE_PROFILE_MODEL", "gpt-3.5-turbo")
    vi.stubEnv("NDIAYE_PLANNER_TEMPERATURE", "0.7")
    invalidateConfig()

    const config = getConfig()
    expect(config.agents.profile!.model).toBe("gpt-3.5-turbo")
    expect(config.agents.planner!.temperature).toBe(0.7)
  })

  it("getModelConfigForAgent overrides model via runtime overrides", () => {
    vi.stubEnv("NDIAYE_DEFAULT_MODEL", "gemini-2.5-flash")
    invalidateConfig()

    const result = getModelConfigForAgent("vision", { model: "gpt-4o" })
    expect(result.model).toBe("gpt-4o")
  })

  it("getModelConfigForAgent uses agent-specific baseUrl from env vars", () => {
    vi.stubEnv("NDIAYE_VISION_BASE_URL", "https://vision.proxy.com")
    invalidateConfig()

    const result = getModelConfigForAgent("vision")
    expect(result.baseUrl).toBe("https://vision.proxy.com")
  })

  it("getModelConfigForAgent falls back to default baseUrl when no agent override", () => {
    vi.stubEnv("NDIAYE_DEFAULT_BASE_URL", "https://default.proxy.com")
    invalidateConfig()

    const result = getModelConfigForAgent("vision")
    expect(result.baseUrl).toBe("https://default.proxy.com")
  })

  it("falls through to config.default when agent is not in agents map", () => {
    invalidateConfig()
    const result = getModelConfigForAgent("nonexistent" as AgentName)
    expect(result.provider).toBe("gemini")
    expect(result.model).toBe("gemini-2.5-flash")
    expect(result.temperature).toBe(0)
    expect(result.baseUrl).toBeUndefined()
  })
})
