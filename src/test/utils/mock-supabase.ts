import { vi } from "vitest"

export function createMockSupabase() {
  let currentResult: { data: unknown; error: unknown } = { data: null, error: null }

  const builder: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => builder),
    range: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    filter: vi.fn(() => builder),
    match: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    rpc: vi.fn(() => builder),
    textSearch: vi.fn(() => builder),
    not: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    containedBy: vi.fn(() => builder),
    overlaps: vi.fn(() => builder),
    abortSignal: vi.fn(() => builder),
    csv: vi.fn(() => builder),
    then: vi.fn((resolve: (value: unknown) => void) => {
      if (currentResult.error) {
        return Promise.reject(currentResult.error)
      }
      return Promise.resolve(resolve(currentResult))
    }),
  }

  const supabase = {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => builder),
    schema: vi.fn(() => builder),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  }

  function setResult(data: unknown, error?: unknown) {
    currentResult = { data, error: error ?? null }
  }

  return { supabase, builder, setResult }
}
