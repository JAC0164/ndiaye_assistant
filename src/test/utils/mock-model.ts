import { vi } from "vitest"

export function createMockModel(expectedOutput: unknown) {
  const model = {
    withStructuredOutput: vi.fn().mockReturnThis(),
    invoke: vi.fn().mockResolvedValue(expectedOutput),
    pipe: vi.fn().mockReturnThis(),
  }
  return model
}

export function createMockTokenLogger() {
  return vi.fn(() => ({
    handleLLMEnd: vi
      .fn()
      .mockImplementation(
        async (output: {
          llmOutput?: { tokenUsage?: Record<string, number> }
          generations?: Array<Array<{ message: { usage_metadata?: Record<string, number> } }>>
        }) => {
          const usage = output.llmOutput?.tokenUsage ?? output.generations?.[0]?.[0]?.message?.usage_metadata
          return usage
        }
      ),
  }))
}
