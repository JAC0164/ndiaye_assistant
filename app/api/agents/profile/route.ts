import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { profileAgent } from "@/src/lib/langgraph/nodes/profileAgent"
import { ProfileService } from "@/src/services/profile.service"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
  }

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
      extractedTimetableMarkdown: "",
      studentProfileContext: "",
      subjectCoefficients: "",
      isValidTimetable: true,
      validationErrorMessage: undefined,
      generatedPlanning: [],
    })

    const profileService = new ProfileService(supabase)
    await profileService.saveProfileCache(
      user.id,
      (result.studentProfileContext as string) ?? ""
    )

    return NextResponse.json({
      studentProfileContext: result.studentProfileContext,
    })
  } catch (err) {
    console.error("Profile agent error:", err)
    return NextResponse.json({ error: "Erreur lors de l'analyse du profil." }, { status: 500 })
  }
}
