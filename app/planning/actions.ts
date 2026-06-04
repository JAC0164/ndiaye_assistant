"use server"

import { createClient } from "@/src/lib/supabase/actions"
import { SeanceService } from "@/src/services/seance.service"
import type { GeneratedSeance } from "@/src/lib/langgraph/state"

export async function saveUserSessionsAction(seances: GeneratedSeance[]) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Authentification requise.")
  }

  const service = new SeanceService(supabase)
  
  // Supprimer les séances existantes de l'utilisateur
  const { error: deleteError } = await supabase
    .from("sessions")
    .delete()
    .eq("user_id", user.id)

  if (deleteError) {
    throw new Error(`Erreur lors de la réinitialisation du planning: ${deleteError.message}`)
  }

  // Insérer les nouvelles séances modifiées
  const inserted = await service.createMany(user.id, seances)
  return { success: true, count: inserted.length }
}
