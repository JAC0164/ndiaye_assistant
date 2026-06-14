export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      school_levels: {
        Row: {
          id: string
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      series: {
        Row: {
          id: string
          name: string
          description: string | null
          level_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          level_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          level_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      classes: {
        Row: {
          id: string
          name: string
          level_id: string
          series_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          level_id: string
          series_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          level_id?: string
          series_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      coefficients: {
        Row: {
          id: string
          class_id: string
          subject: string
          coefficient: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          subject: string
          coefficient: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          class_id?: string
          subject?: string
          coefficient?: number
          created_at?: string
          updated_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          start_time: string
          end_time: string
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          pedagogical_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          start_time: string
          end_time: string
          subject: string
          session_type?: Database["public"]["Enums"]["session_type"]
          pedagogical_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          start_time?: string
          end_time?: string
          subject?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          pedagogical_note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          avatar_url: string | null
          birthday: string | null
          confidence_level: number | null
          class_id: string | null
          metadata: Json
          current_streak: number
          longest_streak: number
          last_streak_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string
          display_name?: string
          avatar_url?: string | null
          birthday?: string | null
          confidence_level?: number | null
          class_id?: string | null
          metadata?: Json
          current_streak?: number
          longest_streak?: number
          last_streak_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          avatar_url?: string | null
          birthday?: string | null
          confidence_level?: number | null
          class_id?: string | null
          metadata?: Json
          current_streak?: number
          longest_streak?: number
          last_streak_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      echeances: {
        Row: {
          id: string
          user_id: string
          subject: string
          title: string
          description: string | null
          due_date: string
          echeance_type: "devoir" | "examen" | "composition" | "projet"
          is_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subject: string
          title: string
          description?: string | null
          due_date: string
          echeance_type: "devoir" | "examen" | "composition" | "projet"
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subject?: string
          title?: string
          description?: string | null
          due_date?: string
          echeance_type?: "devoir" | "examen" | "composition" | "projet"
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      historique: {
        Row: {
          id: string
          user_id: string
          session_id: string | null
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          completed_at: string
          duration_minutes: number | null
          self_rating: number | null
          feedback: Database["public"]["Enums"]["feedback_rating"]
          notes: string | null
          completed: boolean | null
          ressenti: number | null
          duree_reelle_min: number | null
          rescheduled_from: string | null
        }
        Insert: {
          id?: string
          user_id: string
          session_id?: string | null
          subject: string
          session_type: Database["public"]["Enums"]["session_type"]
          completed_at?: string
          duration_minutes?: number | null
          self_rating?: number | null
          feedback?: Database["public"]["Enums"]["feedback_rating"]
          notes?: string | null
          completed?: boolean | null
          ressenti?: number | null
          duree_reelle_min?: number | null
          rescheduled_from?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string | null
          subject?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          completed_at?: string
          duration_minutes?: number | null
          self_rating?: number | null
          feedback?: Database["public"]["Enums"]["feedback_rating"]
          notes?: string | null
          completed?: boolean | null
          ressenti?: number | null
          duree_reelle_min?: number | null
          rescheduled_from?: string | null
        }
      }
      user_push_tokens: {
        Row: {
          id: string
          user_id: string
          device_id: string
          token: string
          platform: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id: string
          token: string
          platform: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device_id?: string
          token?: string
          platform?: string
          created_at?: string
          updated_at?: string
        }
      }
      friendships: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          created_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          created_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      sync_offline_data: {
        Args: {
          p_user_id: string
          p_payload: Json
        }
        Returns: Json
      }
    }
    Enums: {
      day_of_week: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
      session_type: "td" | "review" | "break"
      feedback_rating: "DIFFICILE" | "MOYEN" | "MAITRISE"
      friendship_status: "PENDING" | "ACCEPTED"
    }
  }
}
