import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "src/services/**",
        "src/lib/langgraph/**",
        "src/lib/planning/**",
        "src/lib/rate-limit.ts",
        "src/lib/supabase/**",
        "app/api/**",
        "proxy.ts",
      ],
      exclude: [
        "src/lib/langgraph/providers/index.ts",
        "src/lib/supabase/server-client.ts",
        "app/api/echeances/[id]/route.ts",
        "node_modules/**",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
