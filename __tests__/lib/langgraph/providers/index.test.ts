import { describe, it, expect } from "vitest"

describe("providers/index (barrel)", () => {
  it("re-exports config and types functions", async () => {
    const mod = await import("@/src/lib/langgraph/providers/index")

    expect(typeof mod.getModelConfigForAgent).toBe("function")
    expect(typeof mod.getConfig).toBe("function")
    expect(typeof mod.invalidateConfig).toBe("function")
    expect(typeof mod.getProviderLabel).toBe("function")
  })
})
