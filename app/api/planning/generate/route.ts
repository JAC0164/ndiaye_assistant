import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/src/lib/supabase/server"
import { runPlanningWorkflow } from "@/src/lib/langgraph/orchestrator"
import type { ModelOverrides } from "@/src/lib/langgraph/providers"

export const runtime = "nodejs"

type ErrorResponse = {
  error: string
}

type ImageUpload = {
  buffer: Buffer
  mimeType: string
}

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

export async function POST(request: NextRequest) {
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
    modelOverrides = parseJSONField<ModelOverrides>(formData.get("modelOverrides"))
  } catch (error) {
    return jsonError(
      400,
      error instanceof Error ? error.message : "Requête invalide."
    )
  }

  try {
    const result = await runPlanningWorkflow(
      imageUpload.buffer,
      onboardingData,
      imageUpload.mimeType,
      modelOverrides
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
    return jsonError(
      500,
      error instanceof Error
        ? error.message
        : "Erreur lors de la génération du planning."
    )
  }
}
