import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"
import { BaseService } from "./base.service"

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

    if (error) {
      throw new Error(`Erreur lors de la récupération des coefficients pour la classe ${classId}: ${error.message}`)
    }

    return data as Coefficient[]
  }

  async getCoefficientsByClassName(className: string): Promise<Coefficient[]> {
    const { data: classData, error: classError } = await this.supabase
      .from("classes")
      .select("id")
      .eq("name", className)
      .maybeSingle()

    if (classError || !classData) {
      return []
    }

    return this.getByClassId(classData.id)
  }
}
