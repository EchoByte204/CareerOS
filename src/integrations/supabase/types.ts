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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string
          id: string
          payload: Json
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          job_id: string
          notes: string | null
          resume_version_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ats_reports: {
        Row: {
          breakdown: Json
          created_at: string
          id: string
          job_id: string | null
          model: string | null
          overall_score: number
          resume_id: string
          resume_version_id: string | null
          suggestions: Json
          user_id: string
        }
        Insert: {
          breakdown?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          model?: string | null
          overall_score: number
          resume_id: string
          resume_version_id?: string | null
          suggestions?: Json
          user_id: string
        }
        Update: {
          breakdown?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          model?: string | null
          overall_score?: number
          resume_id?: string
          resume_version_id?: string | null
          suggestions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ats_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_reports_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_reports_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          application_id: string
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          job_id: string
          kind: string
          last_error: string | null
          max_attempts: number
          result: Json | null
          resume_id: string
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id: string
          kind: string
          last_error?: string | null
          max_attempts?: number
          result?: Json | null
          resume_id: string
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          result?: Json | null
          resume_id?: string
          scheduled_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      company_jobs: {
        Row: {
          ats_provider: string
          ats_slug: string
          company_name: string
          department: string | null
          external_id: string
          fetched_at: string
          id: string
          location: string | null
          posted_at: string | null
          snippet: string | null
          title: string
          url: string
        }
        Insert: {
          ats_provider: string
          ats_slug: string
          company_name: string
          department?: string | null
          external_id: string
          fetched_at?: string
          id?: string
          location?: string | null
          posted_at?: string | null
          snippet?: string | null
          title: string
          url: string
        }
        Update: {
          ats_provider?: string
          ats_slug?: string
          company_name?: string
          department?: string | null
          external_id?: string
          fetched_at?: string
          id?: string
          location?: string | null
          posted_at?: string | null
          snippet?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      cover_letters: {
        Row: {
          body_text: string
          company: string
          created_at: string
          id: string
          job_id: string | null
          latex: string
          length: string
          model: string | null
          recipient: string
          resume_id: string | null
          role_title: string
          title: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_text?: string
          company?: string
          created_at?: string
          id?: string
          job_id?: string | null
          latex?: string
          length?: string
          model?: string | null
          recipient?: string
          resume_id?: string | null
          role_title?: string
          title?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_text?: string
          company?: string
          created_at?: string
          id?: string
          job_id?: string | null
          latex?: string
          length?: string
          model?: string | null
          recipient?: string
          resume_id?: string | null
          role_title?: string
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cover_letters_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cover_letters_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      followed_companies: {
        Row: {
          ats_provider: string
          ats_slug: string
          careers_url: string | null
          created_at: string
          id: string
          last_error: string | null
          last_job_count: number
          last_synced_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ats_provider: string
          ats_slug: string
          careers_url?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_job_count?: number
          last_synced_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ats_provider?: string
          ats_slug?: string
          careers_url?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_job_count?: number
          last_synced_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_skills: {
        Row: {
          confidence: number
          created_at: string
          evidence: string | null
          id: string
          importance: Database["public"]["Enums"]["skill_importance"]
          job_id: string
          skill_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence?: string | null
          id?: string
          importance?: Database["public"]["Enums"]["skill_importance"]
          job_id: string
          skill_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence?: string | null
          id?: string
          importance?: Database["public"]["Enums"]["skill_importance"]
          job_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company: string
          created_at: string
          description: string
          external_id: string | null
          external_url: string | null
          id: string
          location: string | null
          parsed: Json
          posted_at: string | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          source: Database["public"]["Enums"]["job_source"]
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string
          description: string
          external_id?: string | null
          external_url?: string | null
          id?: string
          location?: string | null
          parsed?: Json
          posted_at?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: Database["public"]["Enums"]["job_source"]
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string
          description?: string
          external_id?: string | null
          external_url?: string | null
          id?: string
          location?: string | null
          parsed?: Json
          posted_at?: string | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          source?: Database["public"]["Enums"]["job_source"]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      learning_recommendations: {
        Row: {
          cost: string | null
          created_at: string
          description: string | null
          duration: string | null
          id: string
          job_id: string | null
          level: string | null
          metadata: Json
          provider: string | null
          rationale: string | null
          resource_type: Database["public"]["Enums"]["learning_resource_type"]
          score: number
          skill_id: string | null
          status: Database["public"]["Enums"]["learning_status"]
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          cost?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          job_id?: string | null
          level?: string | null
          metadata?: Json
          provider?: string | null
          rationale?: string | null
          resource_type?: Database["public"]["Enums"]["learning_resource_type"]
          score?: number
          skill_id?: string | null
          status?: Database["public"]["Enums"]["learning_status"]
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          cost?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          job_id?: string | null
          level?: string | null
          metadata?: Json
          provider?: string | null
          rationale?: string | null
          resource_type?: Database["public"]["Enums"]["learning_resource_type"]
          score?: number
          skill_id?: string | null
          status?: Database["public"]["Enums"]["learning_status"]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_recommendations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_recommendations_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          headline: string | null
          id: string
          links: Json
          location: string | null
          onboarded_at: string | null
          seniority: Database["public"]["Enums"]["seniority_level"] | null
          target_locations: string[]
          target_roles: string[]
          updated_at: string
          work_auth: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          headline?: string | null
          id: string
          links?: Json
          location?: string | null
          onboarded_at?: string | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          target_locations?: string[]
          target_roles?: string[]
          updated_at?: string
          work_auth?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          headline?: string | null
          id?: string
          links?: Json
          location?: string | null
          onboarded_at?: string | null
          seniority?: Database["public"]["Enums"]["seniority_level"] | null
          target_locations?: string[]
          target_roles?: string[]
          updated_at?: string
          work_auth?: string | null
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          action: Json
          body: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          score: number
          title: string
          user_id: string
        }
        Insert: {
          action?: Json
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          score?: number
          title: string
          user_id: string
        }
        Update: {
          action?: Json
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          score?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          label: string
          parent_version_id: string | null
          resume_id: string
          tailored_for_job_id: string | null
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          label?: string
          parent_version_id?: string | null
          resume_id: string
          tailored_for_job_id?: string | null
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          label?: string
          parent_version_id?: string | null
          resume_id?: string
          tailored_for_job_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          content: Json
          created_at: string
          file_path: string | null
          id: string
          is_primary: boolean
          parsed_at: string | null
          source: Database["public"]["Enums"]["resume_source"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          file_path?: string | null
          id?: string
          is_primary?: boolean
          parsed_at?: string | null
          source?: Database["public"]["Enums"]["resume_source"]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          file_path?: string | null
          id?: string
          is_primary?: boolean
          parsed_at?: string | null
          source?: Database["public"]["Enums"]["resume_source"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_aliases: {
        Row: {
          alias: string
          alias_normalized: string
          created_at: string
          id: string
          skill_id: string
        }
        Insert: {
          alias: string
          alias_normalized: string
          created_at?: string
          id?: string
          skill_id: string
        }
        Update: {
          alias?: string
          alias_normalized?: string
          created_at?: string
          id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_aliases_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_edges: {
        Row: {
          created_at: string
          edge_type: Database["public"]["Enums"]["skill_edge_type"]
          from_skill: string
          id: string
          to_skill: string
          weight: number
        }
        Insert: {
          created_at?: string
          edge_type?: Database["public"]["Enums"]["skill_edge_type"]
          from_skill: string
          id?: string
          to_skill: string
          weight?: number
        }
        Update: {
          created_at?: string
          edge_type?: Database["public"]["Enums"]["skill_edge_type"]
          from_skill?: string
          id?: string
          to_skill?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_edges_from_skill_fkey"
            columns: ["from_skill"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_edges_to_skill_fkey"
            columns: ["to_skill"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_extraction_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["skill_job_kind"]
          last_error: string | null
          max_attempts: number
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["skill_job_status"]
          target_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["skill_job_kind"]
          last_error?: string | null
          max_attempts?: number
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["skill_job_status"]
          target_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["skill_job_kind"]
          last_error?: string | null
          max_attempts?: number
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["skill_job_status"]
          target_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["skill_kind"]
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["skill_kind"]
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["skill_kind"]
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_skills: {
        Row: {
          confidence: number
          created_at: string
          evidence: string | null
          id: string
          proficiency: Database["public"]["Enums"]["proficiency_level"] | null
          resume_id: string | null
          skill_id: string
          source: string
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence?: string | null
          id?: string
          proficiency?: Database["public"]["Enums"]["proficiency_level"] | null
          resume_id?: string | null
          skill_id: string
          source?: string
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence?: string | null
          id?: string
          proficiency?: Database["public"]["Enums"]["proficiency_level"] | null
          resume_id?: string | null
          skill_id?: string
          source?: string
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_skills_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_admin_if_none: { Args: { _caller: string }; Returns: boolean }
      claim_automation_jobs: {
        Args: { _limit?: number }
        Returns: {
          application_id: string
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          job_id: string
          kind: string
          last_error: string | null
          max_attempts: number
          result: Json | null
          resume_id: string
          scheduled_at: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_skill_extraction_jobs: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["skill_job_kind"]
          last_error: string | null
          max_attempts: number
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["skill_job_status"]
          target_id: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "skill_extraction_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      resolve_skill: {
        Args: { _input: string }
        Returns: {
          similarity: number
          skill_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      application_status:
        | "saved"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      job_source: "paste" | "url" | "api" | "adzuna"
      learning_resource_type:
        | "course"
        | "project"
        | "book"
        | "article"
        | "video"
        | "tutorial"
        | "certification"
        | "other"
      learning_status:
        | "suggested"
        | "saved"
        | "in_progress"
        | "completed"
        | "dismissed"
      proficiency_level: "beginner" | "intermediate" | "advanced" | "expert"
      resume_source: "upload" | "builder"
      seniority_level:
        | "intern"
        | "entry"
        | "mid"
        | "senior"
        | "staff"
        | "principal"
        | "exec"
      skill_edge_type:
        | "related"
        | "parent_of"
        | "prerequisite_of"
        | "alternative_to"
      skill_importance: "nice_to_have" | "preferred" | "required" | "core"
      skill_job_kind: "resume" | "job"
      skill_job_status: "pending" | "processing" | "done" | "failed"
      skill_kind:
        | "hard"
        | "soft"
        | "tool"
        | "language"
        | "framework"
        | "domain"
        | "certification"
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
    Enums: {
      app_role: ["admin", "user"],
      application_status: [
        "saved",
        "applied",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      job_source: ["paste", "url", "api", "adzuna"],
      learning_resource_type: [
        "course",
        "project",
        "book",
        "article",
        "video",
        "tutorial",
        "certification",
        "other",
      ],
      learning_status: [
        "suggested",
        "saved",
        "in_progress",
        "completed",
        "dismissed",
      ],
      proficiency_level: ["beginner", "intermediate", "advanced", "expert"],
      resume_source: ["upload", "builder"],
      seniority_level: [
        "intern",
        "entry",
        "mid",
        "senior",
        "staff",
        "principal",
        "exec",
      ],
      skill_edge_type: [
        "related",
        "parent_of",
        "prerequisite_of",
        "alternative_to",
      ],
      skill_importance: ["nice_to_have", "preferred", "required", "core"],
      skill_job_kind: ["resume", "job"],
      skill_job_status: ["pending", "processing", "done", "failed"],
      skill_kind: [
        "hard",
        "soft",
        "tool",
        "language",
        "framework",
        "domain",
        "certification",
      ],
    },
  },
} as const
