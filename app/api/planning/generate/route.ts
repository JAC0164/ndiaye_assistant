import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { createClient } from "@/src/lib/supabase/server"
import { runPlanningWorkflow } from "@/src/lib/langgraph/orchestrator"
import type { ModelOverrides } from "@/src/lib/langgraph/providers"

export const runtime = "nodejs"
export const maxDuration = 120

const REQUEST_TIMEOUT = 60_000

const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 10
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

type ErrorResponse = {
  error: string
}

type ImageUpload = {
  buffer: Buffer
  mimeType: string
}

const ALLOWED_PROVIDERS = ["gemini", "openai", "anthropic", "deepseek", "ollama"] as const

const modelOverrideSchema = z.object({
  vision: z.object({
    provider: z.enum(ALLOWED_PROVIDERS).optional(),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    baseUrl: z.union([z.literal(""), z.string().max(500).url()]).optional(),
  }).optional(),
  profile: z.object({
    provider: z.enum(ALLOWED_PROVIDERS).optional(),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    baseUrl: z.union([z.literal(""), z.string().max(500).url()]).optional(),
  }).optional(),
  planner: z.object({
    provider: z.enum(ALLOWED_PROVIDERS).optional(),
    model: z.string().max(100).optional(),
    temperature: z.number().min(0).max(2).optional(),
    baseUrl: z.union([z.literal(""), z.string().max(500).url()]).optional(),
  }).optional(),
})

function jsonError(status: number, error: string) {
  return NextResponse.json<ErrorResponse>({ error }, { status })
}

function parseJSONField<T>(value: FormDataEntryValue | null): T | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function validateModelOverrides(raw: unknown): ModelOverrides | undefined {
  if (!raw) return undefined
  const parsed = modelOverrideSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn("Invalid modelOverrides rejected:", parsed.error.flatten())
    return undefined
  }
  const cleaned = parsed.data as ModelOverrides
  for (const agent of ["vision", "profile", "planner"] as const) {
    const cfg = cleaned[agent]
    if (cfg?.baseUrl === "") {
      delete cfg.baseUrl
    }
  }
  return cleaned
}

async function fileToBuffer(
  value: FormDataEntryValue | null
): Promise<ImageUpload> {
  if (!(value instanceof File)) {
    throw new Error("Le champ timetableImage est requis.")
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Le fichier timetableImage doit être une image.")
  }

  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    mimeType: value.type,
  }
}

async function createAuthenticatedSupabase(request: NextRequest) {
  const bearerToken = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!bearerToken) {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    return { supabase, user, error }
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(bearerToken)

  return { supabase, user, error }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count++
  return true
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`La requête a expiré après ${ms / 1000}s. Veuillez réessayer.`)), ms)
    ),
  ])
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return jsonError(429, "Trop de requêtes. Veuillez réessayer dans une minute.")
  }
  const { supabase, user, error: authError } =
    await createAuthenticatedSupabase(request)

  if (authError || !user) {
    return jsonError(401, "Authentification requise.")
  }

  let imageUpload: ImageUpload
  let onboardingData: unknown
  let modelOverrides: ModelOverrides | undefined

  try {
    const formData = await request.formData()
    imageUpload = await fileToBuffer(formData.get("timetableImage"))
    onboardingData = parseJSONField(formData.get("onboardingData")) ?? {}
    modelOverrides = validateModelOverrides(
      parseJSONField(formData.get("modelOverrides"))
    )
  } catch (error) {
    return jsonError(
      400,
      error instanceof Error ? error.message : "Requête invalide."
    )
  }

  try {
    const result = await withTimeout(
      runPlanningWorkflow(
        supabase,
        user.id,
        imageUpload.buffer,
        onboardingData,
        imageUpload.mimeType,
        modelOverrides
      ),
      REQUEST_TIMEOUT
    )

    if (!result.isValidTimetable) {
      return NextResponse.json(
        {
          isValidTimetable: false,
          validationErrorMessage: result.validationErrorMessage,
          generatedPlanning: [],
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      isValidTimetable: true,
      extractedTimetableMarkdown: result.extractedTimetableMarkdown,
      studentProfileContext: result.studentProfileContext,
      generatedPlanning: result.generatedPlanning,
    })
  } catch (error) {
    console.error("Planning generation error:", error)
    return jsonError(
      500,
      "Erreur lors de la génération du planning. Veuillez réessayer."
    )
  }
}
