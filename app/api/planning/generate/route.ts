import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/src/lib/supabase/server"
import { SeanceService } from "@/src/services/seance.service"

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

function parseOnboardingData(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {}
  }

  try {
    return JSON.parse(value)
  } catch {
    throw new Error("Le champ onboardingData doit être un JSON valide.")
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

  try {
    const formData = await request.formData()
    imageUpload = await fileToBuffer(formData.get("timetableImage"))
    onboardingData = parseOnboardingData(formData.get("onboardingData"))
  } catch (error) {
    return jsonError(
      400,
      error instanceof Error ? error.message : "Requête invalide."
    )
  }

  try {
    const service = new SeanceService(supabase)
    const result = await service.generateFullPlanningWorkflow(
      user.id,
      imageUpload.buffer,
      onboardingData,
      imageUpload.mimeType
    )

    if (!result.isValidTimetable) {
      return NextResponse.json(
        {
          isValidTimetable: false,
          validationErrorMessage: result.validationErrorMessage,
          generatedPlanning: [],
          insertedSeances: [],
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      isValidTimetable: true,
      extractedTimetableMarkdown: result.extractedTimetableMarkdown,
      studentProfileContext: result.studentProfileContext,
      generatedPlanning: result.generatedPlanning,
      insertedSeances: result.insertedSeances,
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
