export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          region: string | null
          start_date: string | null
          tier: string | null
          year: number
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          region?: string | null
          start_date?: string | null
          tier?: string | null
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          region?: string | null
          start_date?: string | null
          tier?: string | null
          year?: number
        }
        Relationships: []
      }
      maps: {
        Row: {
          created_at: string
          id: string
          map_name: string
          map_number: number
          match_id: string
          team1_rounds: number | null
          team2_rounds: number | null
          winner_team_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          map_name: string
          map_number: number
          match_id: string
          team1_rounds?: number | null
          team2_rounds?: number | null
          winner_team_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          map_name?: string
          map_number?: number
          match_id?: string
          team1_rounds?: number | null
          team2_rounds?: number | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maps_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maps_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          best_of: number | null
          created_at: string
          event_id: string | null
          id: string
          match_date: string
          stage: string | null
          team1_id: string
          team1_score: number | null
          team2_id: string
          team2_score: number | null
        }
        Insert: {
          best_of?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          match_date: string
          stage?: string | null
          team1_id: string
          team1_score?: number | null
          team2_id: string
          team2_score?: number | null
        }
        Update: {
          best_of?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          match_date?: string
          stage?: string | null
          team1_id?: string
          team1_score?: number | null
          team2_id?: string
          team2_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_map_stats: {
        Row: {
          acs: number | null
          adr: number | null
          agent_id: string | null
          assists: number
          clutches_attempted: number | null
          clutches_won: number | null
          created_at: string
          deaths: number
          first_deaths: number | null
          first_kills: number | null
          headshot_percentage: number | null
          id: string
          kast: number | null
          kills: number
          map_id: string
          multi_kills: number | null
          player_id: string
          rating: number | null
          rounds_played: number | null
          team_id: string
        }
        Insert: {
          acs?: number | null
          adr?: number | null
          agent_id?: string | null
          assists?: number
          clutches_attempted?: number | null
          clutches_won?: number | null
          created_at?: string
          deaths?: number
          first_deaths?: number | null
          first_kills?: number | null
          headshot_percentage?: number | null
          id?: string
          kast?: number | null
          kills?: number
          map_id: string
          multi_kills?: number | null
          player_id: string
          rating?: number | null
          rounds_played?: number | null
          team_id: string
        }
        Update: {
          acs?: number | null
          adr?: number | null
          agent_id?: string | null
          assists?: number
          clutches_attempted?: number | null
          clutches_won?: number | null
          created_at?: string
          deaths?: number
          first_deaths?: number | null
          first_kills?: number | null
          headshot_percentage?: number | null
          id?: string
          kast?: number | null
          kills?: number
          map_id?: string
          multi_kills?: number | null
          player_id?: string
          rating?: number | null
          rounds_played?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_map_stats_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_map_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          country: string | null
          created_at: string
          current_team_id: string | null
          id: string
          ign: string
          name: string
          role: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          current_team_id?: string | null
          id?: string
          ign: string
          name: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          current_team_id?: string | null
          id?: string
          ign?: string
          name?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          region: string | null
          updated_at: string
          vlr_id: string | null
          vlr_url: string | null
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          region?: string | null
          updated_at?: string
          vlr_id?: string | null
          vlr_url?: string | null
        }
        Update: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          region?: string | null
          updated_at?: string
          vlr_id?: string | null
          vlr_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_readonly_query: {
        Args: {
          query_text: string
        }
        Returns: unknown[]
      }
      search_player_stats: {
        Args: {
          p_player_ign?: string
          p_team_name?: string
          p_map_name?: string
          p_event_name?: string
          p_event_tier?: string
          p_stage?: string
          p_agent_name?: string
          p_agent_role?: string
          p_player_role?: string
          p_year_min?: number
          p_year_max?: number
          p_order_by?: string
          p_order_dir?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          stat_id: string
          player_ign: string
          player_name: string
          player_role: string | null
          team_name: string
          team_abbreviation: string | null
          agent_name: string | null
          agent_role: string | null
          map_name: string
          event_name: string | null
          event_tier: string | null
          event_year: number | null
          match_stage: string | null
          match_date: string | null
          kills: number
          deaths: number
          assists: number
          acs: number | null
          adr: number | null
          kast: number | null
          rating: number | null
          first_kills: number | null
          first_deaths: number | null
          headshot_percentage: number | null
          clutches_won: number | null
          clutches_attempted: number | null
          multi_kills: number | null
          rounds_played: number | null
          kd_ratio: number | null
          vlr_match_url: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
