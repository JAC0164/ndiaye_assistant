import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/src/lib/supabase/server"
import { visionAgent } from "@/src/lib/langgraph/nodes/visionAgent"
import { ProfileService } from "@/src/services/profile.service"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("timetableImage")

  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Fichier image requis." }, { status: 400 })
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
    console.error("Vision agent error:", err)
    return NextResponse.json({ error: "Erreur lors de l'analyse de l'image." }, { status: 500 })
  }
}
