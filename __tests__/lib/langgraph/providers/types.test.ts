import { describe, it, expect } from "vitest"
import { getProviderLabel } from "@/src/lib/langgraph/providers/types"

describe("getProviderLabel", () => {
  it('returns "Google Gemini" for gemini', () => {
    expect(getProviderLabel("gemini")).toBe("Google Gemini")
  })

  it('returns "OpenAI" for openai', () => {
    expect(getProviderLabel("openai")).toBe("OpenAI")
  })

  it('returns "Anthropic Claude" for anthropic', () => {
    expect(getProviderLabel("anthropic")).toBe("Anthropic Claude")
  })

  it('returns "DeepSeek" for deepseek', () => {
    expect(getProviderLabel("deepseek")).toBe("DeepSeek")
  })

  it('returns "Ollama (local)" for ollama', () => {
    expect(getProviderLabel("ollama")).toBe("Ollama (local)")
  })

  it('returns "Groq" for groq', () => {
    expect(getProviderLabel("groq")).toBe("Groq")
  })

  it("returns undefined for unknown provider", () => {
    expect(getProviderLabel("unknown" as any)).toBeUndefined()
  })
})
