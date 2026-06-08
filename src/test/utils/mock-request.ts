import { vi } from "vitest"

export function createMockRequest(method: string, options?: {
  body?: unknown
  headers?: Record<string, string>
  url?: string
  formData?: FormData
}): any {
  const headers = options?.headers ?? {}
  return {
    method,
    headers: {
      get: vi.fn((name: string) => headers[name] ?? null),
      forEach: vi.fn(),
    },
    json: vi.fn().mockResolvedValue(options?.body ?? {}),
    formData: vi.fn().mockResolvedValue(options?.formData ?? new FormData()),
    text: vi.fn(),
    url: options?.url ?? "http://localhost:3000",
    nextUrl: new URL(options?.url ?? "http://localhost:3000"),
  }
}
