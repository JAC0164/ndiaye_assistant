"use server"

import { createClient } from "@/src/lib/supabase/actions"
import { SessionService } from "@/src/services/session.service"
import type { GeneratedSeance } from "@/src/lib/langgraph/state"
import { revalidatePath } from "next/cache"

export async function saveUserSessionsAction(seances: GeneratedSeance[]) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Authentification requise.")
  }

  const service = new SessionService(supabase)

  // Remplacer les séances de l'utilisateur via le service dédié
  const inserted = await service.replaceAll(user.id, seances)

  // Revalider sélectivement le cache pour rafraîchir instantanément les composants côté serveur
  revalidatePath("/planning")

  return { success: true, count: inserted.length }
}
