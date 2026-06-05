import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { BaseService } from "./base.service"

export type Echeance = Database["public"]["Tables"]["echeances"]["Row"]

export class EcheanceService extends BaseService<Echeance> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "echeances")
  }

  async getUpcoming(userId: string, daysLimit = 14): Promise<Echeance[]> {
    const today = new Date()
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + daysLimit)

    const todayStr = today.toISOString().split("T")[0]
    const futureDateStr = futureDate.toISOString().split("T")[0]

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .gte("due_date", todayStr)
      .lte("due_date", futureDateStr)
      .order("due_date", { ascending: true })

    if (error) {
      throw new Error(`Erreur lors de la récupération des échéances à venir: ${error.message}`)
    }

    return data as Echeance[]
  }

  async markCompleted(id: string, isCompleted = true): Promise<Echeance> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({
        is_completed: isCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new Error(`Erreur lors du marquage de l'échéance comme complétée: ${error.message}`)
    }

    return data as Echeance
  }
}
