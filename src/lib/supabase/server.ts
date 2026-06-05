import { createSupabaseServerClient } from "./server-client"

export async function createClient() {
  // Server components / route handlers (isReadOnly = true is safer for components, but false works generally with the try-catch)
  return createSupabaseServerClient(true)
}
