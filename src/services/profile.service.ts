import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { OnboardingForm, ProfileMetadata } from "@/src/types/planning.types"
import { BaseService } from "./base.service"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]

export type CachedAnalysis = {
  extractedTimetableMarkdown: string
  isValidTimetable: boolean
  studentProfileContext: string
}

export class ProfileService extends BaseService<Profile> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "profiles")
  }

  async getByUserId(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from(this.tableName).select("*").eq("id", userId).maybeSingle()

    if (error) {
      throw new Error(`Erreur lors de la récupération du profil: ${error.message}`)
    }

    return data as Profile | null
  }

  async updateOnboarding(userId: string, onboarding: OnboardingForm): Promise<Profile> {
    const currentProfile = await this.getByUserId(userId)
    if (!currentProfile) {
      throw new Error(`Profil non trouvé pour l'utilisateur: ${userId}`)
    }

    const existingMetadata = (currentProfile.metadata as ProfileMetadata) || {}
    const updatedMetadata = {
      ...existingMetadata,
      weakSubjects: onboarding.weakSubjects,
      bedtime: onboarding.bedtime,
      blockedSlots: onboarding.blockedSlots,
    }

    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors de la mise à jour des données d'onboarding: ${error.message}`)
    }

    return data as Profile
  }

  async getCachedAnalysis(userId: string): Promise<CachedAnalysis | null> {
    const profile = await this.getByUserId(userId)
    if (!profile?.metadata) return null

    const meta = profile.metadata as ProfileMetadata

    const timetable = meta.cachedExtractedTimetable
    const profileCtx = meta.cachedProfileContext

    if (typeof timetable !== "string" && typeof profileCtx !== "string") return null

    return {
      extractedTimetableMarkdown: typeof timetable === "string" ? timetable : "",
      isValidTimetable: meta.cachedTimetableValid !== false,
      studentProfileContext: typeof profileCtx === "string" ? profileCtx : "",
    }
  }

  async saveAnalysisCache(
    userId: string,
    timetable: string | undefined,
    isValid: boolean | undefined,
    context: string | undefined
  ): Promise<void> {
    const profile = await this.getByUserId(userId)
    if (!profile) return

    const meta = (profile.metadata as ProfileMetadata) || {}
    if (timetable !== undefined) meta.cachedExtractedTimetable = timetable
    if (isValid !== undefined) meta.cachedTimetableValid = isValid
    if (context !== undefined) meta.cachedProfileContext = context

    await this.supabase
      .from(this.tableName)
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq("id", userId)
  }

  async saveVisionCache(userId: string, timetable: string, isValid: boolean): Promise<void> {
    return this.saveAnalysisCache(userId, timetable, isValid, undefined)
  }

  async saveProfileCache(userId: string, context: string): Promise<void> {
    return this.saveAnalysisCache(userId, undefined, undefined, context)
  }
}
