import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { OnboardingForm } from "@/src/types/planning.types"
import { BaseService } from "./base.service"

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]

export class ProfileService extends BaseService<Profile> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "profiles")
  }

  async getByUserId(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Erreur lors de la récupération du profil: ${error.message}`)
    }

    return data as Profile | null
  }

  async updateOnboarding(userId: string, onboarding: OnboardingForm): Promise<Profile> {
    // Check if profile exists, if not it will be created by trigger, but we update it here
    const currentProfile = await this.getByUserId(userId)
    if (!currentProfile) {
      throw new Error(`Profil non trouvé pour l'utilisateur: ${userId}`)
    }

    // Merge onboarding data into the metadata JSONB column
    const existingMetadata = (currentProfile.metadata as Record<string, any>) || {}
    const updatedMetadata = {
      ...existingMetadata,
      serie: onboarding.serie,
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
}
