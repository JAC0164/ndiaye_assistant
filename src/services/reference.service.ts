import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/src/types/database.types"

type SchoolLevel = Database["public"]["Tables"]["school_levels"]["Row"]
type Series = Database["public"]["Tables"]["series"]["Row"]
type Class = Database["public"]["Tables"]["classes"]["Row"]
type Coefficient = Database["public"]["Tables"]["coefficients"]["Row"]

export class ReferenceService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  async getLevels(): Promise<SchoolLevel[]> {
    const { data, error } = await this.supabase
      .from("school_levels")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) throw new Error(`Erreur lors du chargement des niveaux: ${error.message}`)
    return data as SchoolLevel[]
  }

  async getSeries(levelId?: string): Promise<Series[]> {
    let query = this.supabase.from("series").select("*").order("name", { ascending: true })

    if (levelId) query = query.eq("level_id", levelId)

    const { data, error } = await query
    if (error) throw new Error(`Erreur lors du chargement des séries: ${error.message}`)
    return data as Series[]
  }

  async getClasses(levelId?: string, seriesId?: string): Promise<Class[]> {
    let query = this.supabase
      .from("classes")
      .select("*, series(name), school_levels!inner(name)")
      .order("name", { ascending: true })

    if (levelId) query = query.eq("level_id", levelId)
    if (seriesId) query = query.eq("series_id", seriesId)

    const { data, error } = await query
    if (error) throw new Error(`Erreur lors du chargement des classes: ${error.message}`)
    return data as Class[]
  }

  async getCoefficients(classId?: string, className?: string): Promise<Coefficient[]> {
    if (className) {
      const { data, error } = await this.supabase
        .from("coefficients")
        .select("*, classes!inner(name)")
        .eq("classes.name", className)
        .order("coefficient", { ascending: false })

      if (error) throw new Error(`Erreur lors du chargement des coefficients: ${error.message}`)
      return data as Coefficient[]
    }

    let query = this.supabase.from("coefficients").select("*").order("coefficient", { ascending: false })

    if (classId) query = query.eq("class_id", classId)

    const { data, error } = await query
    if (error) throw new Error(`Erreur lors du chargement des coefficients: ${error.message}`)
    return data as Coefficient[]
  }
}
