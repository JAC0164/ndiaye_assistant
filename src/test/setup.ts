import { beforeAll, vi } from "vitest"

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
  vi.stubEnv("GOOGLE_API_KEY", "test-google-api-key")
})

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
  })),
}))

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map(Object.entries(init?.headers ?? {})),
    })),
    next: vi.fn(),
  },
  NextRequest: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => createMockSupabase()),
  createServerClient: vi.fn(() => createMockSupabase()),
}))

import { createMockSupabase } from "./utils/mock-supabase"
export { createMockSupabase }
