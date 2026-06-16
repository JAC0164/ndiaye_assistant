import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/src/lib/api-middleware"
import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"
import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

const MAX_VISION_IMAGE_SIZE = Number(process.env.NDIAYE_MAX_IMAGE_SIZE ?? 10 * 1024 * 1024)

export async function POST(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const formData = await request.formData()
  const file = formData.get("timetableImage")

  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Fichier image requis." }, { status: 400 })
  }

  if (file.size > MAX_VISION_IMAGE_SIZE) {
    return NextResponse.json({ error: "L'image ne doit pas dépasser 10 Mo." }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const result = await visionAgent({
      timetableImage: buffer,
      timetableImageMimeType: file.type,
      onboardingData: null,
      timetableSummary: "",
      studentProfileContext: "",
      extractedTimetable: null,
      coefficientTable: "",
      classSeriesName: "",
      preplannerConstraints: "",
      isValidTimetable: true,
      validationErrorMessage: undefined,
      generatedPlanning: [],
      planningValidation: null,
    })

    const profileService = new ProfileService(supabase)
    await profileService.saveVisionCache(
      user.id,
      (result.timetableSummary as string) ?? "",
      (result.isValidTimetable as boolean) ?? true
    )

    return NextResponse.json(
      {
        timetableSummary: result.timetableSummary as string,
        isValidTimetable: result.isValidTimetable as boolean,
        validationErrorMessage: result.validationErrorMessage as string | undefined,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    )
  } catch (err) {
    logger.error({ err }, "Vision agent error")
    return NextResponse.json({ error: "Erreur lors de l'analyse de l'image." }, { status: 500 })
  }
}
