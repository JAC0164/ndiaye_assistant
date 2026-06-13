import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { BaseService } from "./base.service"
import { logger } from "@/src/lib/logger"

export type Coefficient = Database["public"]["Tables"]["coefficients"]["Row"]

export class CoefficientService extends BaseService<Coefficient> {
  constructor(supabase: SupabaseClient) {
    super(supabase, "coefficients")
  }

  async getByClassId(classId: string): Promise<Coefficient[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("class_id", classId)
      .order("coefficient", { ascending: false })

    if (error) {
      throw new Error(`Erreur lors de la récupération des coefficients pour la classe ${classId}: ${error.message}`)
    }

    return data as Coefficient[]
  }

  async getCoefficientsByClassName(className: string): Promise<Coefficient[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*, classes!inner(name)")
      .eq("classes.name", className)
      .order("coefficient", { ascending: false })

    if (error) {
      logger.error({ error: error.message, className }, "Failed to fetch coefficients by class name")
      return []
    }

    return data as Coefficient[]
  }
}
