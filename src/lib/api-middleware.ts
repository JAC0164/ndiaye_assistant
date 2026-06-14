import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import type { SupabaseClient, User } from "@supabase/supabase-js"

type AuthResult =
  | { supabase: SupabaseClient; user: User; error?: undefined }
  | { error: NextResponse; supabase?: undefined; user?: undefined }

export async function withAuth(request: NextRequest): Promise<AuthResult> {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return { error: NextResponse.json({ error: "Trop de requêtes." }, { status: 429 }) }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) }
  }

  return { supabase, user }
}
