import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSRClient } from "@/src/lib/supabase/server"
import { createClient as createBrowserClient } from "@supabase/supabase-js"
import type { SupabaseClient, User } from "@supabase/supabase-js"

type AuthResult =
  | { supabase: SupabaseClient; user: User; error?: undefined }
  | { error: NextResponse; supabase?: undefined; user?: undefined }

export async function withAuth(request: NextRequest): Promise<AuthResult> {
  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]

  // Mobile API client with Bearer token
  if (bearerToken) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return { error: NextResponse.json({ error: "Erreur de configuration serveur." }, { status: 500 }) }
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    })

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearerToken)
    if (error || !user) {
      return { error: NextResponse.json({ error: "Token invalide ou expiré." }, { status: 401 }) }
    }

    return { supabase, user }
  }

  // Web client with SSR cookies
  const supabase = await createSSRClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Authentification requise." }, { status: 401 }) }
  }

  return { supabase, user }
}
