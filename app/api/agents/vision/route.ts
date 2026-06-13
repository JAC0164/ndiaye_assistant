import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { checkRateLimit } from "@/src/lib/rate-limit"
import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"
import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

const MAX_VISION_IMAGE_SIZE = Number(process.env.NDIAYE_MAX_IMAGE_SIZE ?? 10 * 1024 * 1024)

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Trop de requêtes. Veuillez réessayer dans une minute." }, { status: 429 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
  }

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
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      subjectCoefficients: "",
      weeklyStats: "",
      isValidTimetable: true,
      validationErrorMessage: undefined,
      generatedPlanning: [],
    })

    const profileService = new ProfileService(supabase)
    await profileService.saveVisionCache(
      user.id,
      (result.extractedTimetableMarkdown as string) ?? "",
      (result.isValidTimetable as boolean) ?? true
    )

    return NextResponse.json({
      extractedTimetableMarkdown: result.extractedTimetableMarkdown,
      isValidTimetable: result.isValidTimetable,
      validationErrorMessage: result.validationErrorMessage,
    })
  } catch (err) {
    logger.error({ err }, "Vision agent error")
    return NextResponse.json({ error: "Erreur lors de l'analyse de l'image." }, { status: 500 })
  }
}
