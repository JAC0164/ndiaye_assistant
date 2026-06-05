import { createSupabaseServerClient } from "./server-client"

export async function createClient() {
  // Server Actions can write cookies, so isReadOnly = false
  return createSupabaseServerClient(false)
}
