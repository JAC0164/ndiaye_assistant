import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/src/lib/api-middleware"
import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"
import { ProfileService } from "@/src/services/profile.service"
import { logger } from "@/src/lib/logger"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await withAuth(request)
  if (auth.error) return auth.error
  const { supabase, user } = auth

  let onboardingData: unknown
  try {
    const body = await request.json()
    onboardingData = body.onboardingData ?? {}
  } catch {
    return NextResponse.json({ error: "Données d'onboarding requises." }, { status: 400 })
  }

  try {
    const result = await profileAgent({
      timetableImage: Buffer.from(""),
      timetableImageMimeType: "image/jpeg",
      onboardingData,
      timetableSummary: "",
      studentProfileContext: "",
      extractedTimetable: null,
      coefficientTable: "",
      preplannerConstraints: "",
      isValidTimetable: true,
      validationErrorMessage: undefined,
      generatedPlanning: [],
      planningValidation: null,
    })

    const profileService = new ProfileService(supabase)
    await profileService.saveProfileCache(user.id, (result.studentProfileContext as string) ?? "")

    return NextResponse.json(
      { studentProfileContext: result.studentProfileContext as string },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    )
  } catch (err) {
    logger.error({ err }, "Profile agent error")
    return NextResponse.json({ error: "Erreur lors de l'analyse du profil." }, { status: 500 })
  }
}
