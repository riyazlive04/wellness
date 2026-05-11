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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievement_progress: {
        Row: {
          achievement_id: string
          client_id: string
          current_value: number | null
          id: string
          last_updated: string
          metadata: Json | null
          target_value: number
        }
        Insert: {
          achievement_id: string
          client_id: string
          current_value?: number | null
          id?: string
          last_updated?: string
          metadata?: Json | null
          target_value: number
        }
        Update: {
          achievement_id?: string
          client_id?: string
          current_value?: number | null
          id?: string
          last_updated?: string
          metadata?: Json | null
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "achievement_progress_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          badge_color: string
          category: Database["public"]["Enums"]["achievement_category"]
          created_at: string
          criteria_type: Database["public"]["Enums"]["achievement_criteria_type"]
          criteria_value: number
          description: string
          icon: string
          id: string
          is_active: boolean | null
          name: string
          points: number
        }
        Insert: {
          badge_color: string
          category: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria_type: Database["public"]["Enums"]["achievement_criteria_type"]
          criteria_value: number
          description: string
          icon: string
          id?: string
          is_active?: boolean | null
          name: string
          points?: number
        }
        Update: {
          badge_color?: string
          category?: Database["public"]["Enums"]["achievement_category"]
          created_at?: string
          criteria_type?: Database["public"]["Enums"]["achievement_criteria_type"]
          criteria_value?: number
          description?: string
          icon?: string
          id?: string
          is_active?: boolean | null
          name?: string
          points?: number
        }
        Relationships: []
      }
      action_plans: {
        Row: {
          age: number | null
          client_id: string
          created_at: string | null
          daily_habits: Json | null
          diet_type: string | null
          donts: Json | null
          dos: Json | null
          goals: string | null
          id: string
          lifestyle: string | null
          plan_image_url: string
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          client_id: string
          created_at?: string | null
          daily_habits?: Json | null
          diet_type?: string | null
          donts?: Json | null
          dos?: Json | null
          goals?: string | null
          id?: string
          lifestyle?: string | null
          plan_image_url: string
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          client_id?: string
          created_at?: string | null
          daily_habits?: Json | null
          diet_type?: string | null
          donts?: Json | null
          dos?: Json | null
          goals?: string | null
          id?: string
          lifestyle?: string | null
          plan_image_url?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_requests: {
        Row: {
          admin_notes: string | null
          client_id: string
          created_at: string
          id: string
          metadata: Json | null
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          client_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          request_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          client_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_audits: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          assessment_id: string | null
          before: Json | null
          created_at: string | null
          id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          assessment_id?: string | null
          before?: Json | null
          created_at?: string | null
          id?: string
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          assessment_id?: string | null
          before?: Json | null
          created_at?: string | null
          id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_audits_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_requests: {
        Row: {
          assessment_type: string
          client_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          requested_at: string | null
          requested_by: string | null
          started_at: string | null
          status:
          | Database["public"]["Enums"]["assessment_request_status"]
          | null
          updated_at: string | null
        }
        Insert: {
          assessment_type: string
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          requested_at?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?:
          | Database["public"]["Enums"]["assessment_request_status"]
          | null
          updated_at?: string | null
        }
        Update: {
          assessment_type?: string
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          requested_at?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?:
          | Database["public"]["Enums"]["assessment_request_status"]
          | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          ai_generated: boolean | null
          assessment_data: Json | null
          assessment_type: Database["public"]["Enums"]["assessment_type"] | null
          client_id: string
          created_at: string
          display_name: string | null
          file_history: Json | null
          file_name: string | null
          file_url: string | null
          file_version: number | null
          form_responses: Json | null
          id: string
          notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean | null
          assessment_data?: Json | null
          assessment_type?:
          | Database["public"]["Enums"]["assessment_type"]
          | null
          client_id: string
          created_at?: string
          display_name?: string | null
          file_history?: Json | null
          file_name?: string | null
          file_url?: string | null
          file_version?: number | null
          form_responses?: Json | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean | null
          assessment_data?: Json | null
          assessment_type?:
          | Database["public"]["Enums"]["assessment_type"]
          | null
          client_id?: string
          created_at?: string
          display_name?: string | null
          file_history?: Json | null
          file_name?: string | null
          file_url?: string | null
          file_version?: number | null
          form_responses?: Json | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_message_batches: {
        Row: {
          admin_id: string
          completed_at: string | null
          created_at: string | null
          failed_count: number | null
          id: string
          recipient_count: number
          sent_count: number | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          admin_id: string
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          recipient_count: number
          sent_count?: number | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          admin_id?: string
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          recipient_count?: number
          sent_count?: number | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_message_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          event_date: string
          event_type: string | null
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          event_date: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_type?: string | null
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workflow_state: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          next_action: string | null
          next_action_due_at: string | null
          retargeting_enabled: boolean | null
          retargeting_frequency: string | null
          retargeting_last_sent: string | null
          service_type: string
          stage_completed_at: string | null
          updated_at: string | null
          workflow_stage: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          next_action?: string | null
          next_action_due_at?: string | null
          retargeting_enabled?: boolean | null
          retargeting_frequency?: string | null
          retargeting_last_sent?: string | null
          service_type: string
          stage_completed_at?: string | null
          updated_at?: string | null
          workflow_stage: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          next_action?: string | null
          next_action_due_at?: string | null
          retargeting_enabled?: boolean | null
          retargeting_frequency?: string | null
          retargeting_last_sent?: string | null
          service_type?: string
          stage_completed_at?: string | null
          updated_at?: string | null
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_workflow_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          age: number | null
          badges: Json | null
          community_banned: boolean | null
          community_terms_accepted_at: string | null
          created_at: string
          display_name: string | null
          email: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          goals: string | null
          id: string
          last_weight: number | null
          name: string
          opt_in_directory: boolean | null
          phone: string
          program_type: Database["public"]["Enums"]["program_type"] | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          status: Database["public"]["Enums"]["client_status"] | null
          target_kcal: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          badges?: Json | null
          community_banned?: boolean | null
          community_terms_accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          goals?: string | null
          id?: string
          last_weight?: number | null
          name: string
          opt_in_directory?: boolean | null
          phone: string
          program_type?: Database["public"]["Enums"]["program_type"] | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          status?: Database["public"]["Enums"]["client_status"] | null
          target_kcal?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          badges?: Json | null
          community_banned?: boolean | null
          community_terms_accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          goals?: string | null
          id?: string
          last_weight?: number | null
          name?: string
          opt_in_directory?: boolean | null
          phone?: string
          program_type?: Database["public"]["Enums"]["program_type"] | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          status?: Database["public"]["Enums"]["client_status"] | null
          target_kcal?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_audit_logs: {
        Row: {
          action: string
          actor_admin_id: string | null
          actor_client_id: string | null
          after: Json | null
          before: Json | null
          created_at: string | null
          id: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_admin_id?: string | null
          actor_client_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_admin_id?: string | null
          actor_client_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          id?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_audit_logs_actor_client_id_fkey"
            columns: ["actor_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_client_id: string
          author_display_name: string
          author_service_type: string | null
          content: string
          created_at: string | null
          id: string
          likes_count: number | null
          post_id: string
        }
        Insert: {
          author_client_id: string
          author_display_name: string
          author_service_type?: string | null
          content: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          post_id: string
        }
        Update: {
          author_client_id?: string
          author_display_name?: string
          author_service_type?: string | null
          content?: string
          created_at?: string | null
          id?: string
          likes_count?: number | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_client_id_fkey"
            columns: ["author_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_group_members: {
        Row: {
          client_id: string
          group_id: string
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["community_group_role"] | null
          status: string | null
        }
        Insert: {
          client_id: string
          group_id: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["community_group_role"] | null
          status?: string | null
        }
        Update: {
          client_id?: string
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["community_group_role"] | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_group_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      community_groups: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_private: boolean | null
          member_count: number | null
          moderator_ids: Json | null
          name: string
          owner_client_id: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          member_count?: number | null
          moderator_ids?: Json | null
          name: string
          owner_client_id: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_private?: boolean | null
          member_count?: number | null
          moderator_ids?: Json | null
          name?: string
          owner_client_id?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_groups_owner_client_id_fkey"
            columns: ["owner_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          content: string
          created_at: string | null
          deleted: boolean | null
          id: string
          is_read: boolean | null
          media_urls: Json | null
          receiver_client_id: string
          receiver_service_type_snapshot: string | null
          sender_client_id: string
          sender_service_type_snapshot: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted?: boolean | null
          id?: string
          is_read?: boolean | null
          media_urls?: Json | null
          receiver_client_id: string
          receiver_service_type_snapshot?: string | null
          sender_client_id: string
          sender_service_type_snapshot?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted?: boolean | null
          id?: string
          is_read?: boolean | null
          media_urls?: Json | null
          receiver_client_id?: string
          receiver_service_type_snapshot?: string | null
          sender_client_id?: string
          sender_service_type_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_receiver_client_id_fkey"
            columns: ["receiver_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_sender_client_id_fkey"
            columns: ["sender_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_notifications: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          payload: Json
          read: boolean | null
          type: Database["public"]["Enums"]["community_notification_type"]
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          payload?: Json
          read?: boolean | null
          type: Database["public"]["Enums"]["community_notification_type"]
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          payload?: Json
          read?: boolean | null
          type?: Database["public"]["Enums"]["community_notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "community_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          attachments: Json | null
          author_client_id: string
          author_display_name: string
          author_service_type: string | null
          comments_count: number | null
          content: string
          created_at: string | null
          group_id: string | null
          id: string
          likes_count: number | null
          media_urls: Json | null
          pinned: boolean | null
          tags: Json | null
          title: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["community_visibility"] | null
        }
        Insert: {
          attachments?: Json | null
          author_client_id: string
          author_display_name: string
          author_service_type?: string | null
          comments_count?: number | null
          content: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          likes_count?: number | null
          media_urls?: Json | null
          pinned?: boolean | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          visibility?:
          | Database["public"]["Enums"]["community_visibility"]
          | null
        }
        Update: {
          attachments?: Json | null
          author_client_id?: string
          author_display_name?: string
          author_service_type?: string | null
          comments_count?: number | null
          content?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          likes_count?: number | null
          media_urls?: Json | null
          pinned?: boolean | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          visibility?:
          | Database["public"]["Enums"]["community_visibility"]
          | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_client_id_fkey"
            columns: ["author_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rate_limits: {
        Row: {
          action_date: string
          action_type: string
          client_id: string
          count: number | null
          id: string
        }
        Insert: {
          action_date?: string
          action_type: string
          client_id: string
          count?: number | null
          id?: string
        }
        Update: {
          action_date?: string
          action_type?: string
          client_id?: string
          count?: number | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rate_limits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          reaction: Database["public"]["Enums"]["community_reaction_type"]
          target_id: string
          target_type: Database["public"]["Enums"]["community_target_type"]
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          reaction: Database["public"]["Enums"]["community_reaction_type"]
          target_id: string
          target_type: Database["public"]["Enums"]["community_target_type"]
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          reaction?: Database["public"]["Enums"]["community_reaction_type"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["community_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          id: string
          reason: string
          reporter_client_id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["community_report_status"] | null
          target_id: string
          target_type: Database["public"]["Enums"]["community_target_type"]
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          reason: string
          reporter_client_id: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["community_report_status"] | null
          target_id: string
          target_type: Database["public"]["Enums"]["community_target_type"]
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          id?: string
          reason?: string
          reporter_client_id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["community_report_status"] | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["community_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_reporter_client_id_fkey"
            columns: ["reporter_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_metadata: {
        Row: {
          created_at: string | null
          description: string
          edge_function_name: string
          id: string
          is_active: boolean | null
          job_name: string
          last_run_at: string | null
          last_run_status: string | null
          next_run_at: string | null
          schedule: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          edge_function_name: string
          id?: string
          is_active?: boolean | null
          job_name: string
          last_run_at?: string | null
          last_run_status?: string | null
          next_run_at?: string | null
          schedule: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          edge_function_name?: string
          id?: string
          is_active?: boolean | null
          job_name?: string
          last_run_at?: string | null
          last_run_status?: string | null
          next_run_at?: string | null
          schedule?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          activity_minutes: number | null
          activity_type: string | null
          client_id: string
          created_at: string
          id: string
          log_date: string
          notes: string | null
          steps: number | null
          updated_at: string
          water_intake: number | null
          weight: number | null
        }
        Insert: {
          activity_minutes?: number | null
          activity_type?: string | null
          client_id: string
          created_at?: string
          id?: string
          log_date: string
          notes?: string | null
          steps?: number | null
          updated_at?: string
          water_intake?: number | null
          weight?: number | null
        }
        Update: {
          activity_minutes?: number | null
          activity_type?: string | null
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string
          notes?: string | null
          steps?: number | null
          updated_at?: string
          water_intake?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_preferences: {
        Row: {
          allergies: string[] | null
          calorie_target: number | null
          client_id: string
          created_at: string | null
          dietary_type: string | null
          food_dislikes: Json | null
          id: string
          meal_timings: Json | null
          meals_per_day: number | null
          preferences_notes: string | null
          updated_at: string | null
        }
        Insert: {
          allergies?: string[] | null
          calorie_target?: number | null
          client_id: string
          created_at?: string | null
          dietary_type?: string | null
          food_dislikes?: Json | null
          id?: string
          meal_timings?: Json | null
          meals_per_day?: number | null
          preferences_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          allergies?: string[] | null
          calorie_target?: number | null
          client_id?: string
          created_at?: string | null
          dietary_type?: string | null
          food_dislikes?: Json | null
          id?: string
          meal_timings?: Json | null
          meals_per_day?: number | null
          preferences_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          client_id: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          admin_notes: string | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          follow_up_type: string | null
          id: string
          pre_call_form_data: Json | null
          scheduled_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          follow_up_type?: string | null
          id?: string
          pre_call_form_data?: Json | null
          scheduled_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          follow_up_type?: string | null
          id?: string
          pre_call_form_data?: Json | null
          scheduled_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      food_items: {
        Row: {
          carbs: number | null
          category: string | null
          created_at: string
          fats: number | null
          id: string
          kcal_per_serving: number
          name: string
          protein: number | null
          serving_size: string
          serving_unit: string
          updated_at: string
        }
        Insert: {
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          id?: string
          kcal_per_serving: number
          name: string
          protein?: number | null
          serving_size: string
          serving_unit: string
          updated_at?: string
        }
        Update: {
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          id?: string
          kcal_per_serving?: number
          name?: string
          protein?: number | null
          serving_size?: string
          serving_unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          carbs: number | null
          category: string | null
          created_at: string
          fats: number | null
          id: string
          kcal_per_serving: number
          name: string
          protein: number | null
          serving_size: string
          serving_unit: string
          updated_at: string
        }
        Insert: {
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          id?: string
          kcal_per_serving: number
          name: string
          protein?: number | null
          serving_size: string
          serving_unit: string
          updated_at?: string
        }
        Update: {
          carbs?: number | null
          category?: string | null
          created_at?: string
          fats?: number | null
          id?: string
          kcal_per_serving?: number
          name?: string
          protein?: number | null
          serving_size?: string
          serving_unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      interest_form_submissions: {
        Row: {
          age: number
          contact_number: string
          email: string
          gender: Database["public"]["Enums"]["gender_type"]
          health_goal: Database["public"]["Enums"]["health_goal_type"]
          id: string
          name: string
          notes: string | null
          status: string | null
          submitted_at: string
        }
        Insert: {
          age: number
          contact_number: string
          email: string
          gender: Database["public"]["Enums"]["gender_type"]
          health_goal: Database["public"]["Enums"]["health_goal_type"]
          id?: string
          name: string
          notes?: string | null
          status?: string | null
          submitted_at?: string
        }
        Update: {
          age?: number
          contact_number?: string
          email?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          health_goal?: Database["public"]["Enums"]["health_goal_type"]
          id?: string
          name?: string
          notes?: string | null
          status?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      meal_cards: {
        Row: {
          created_at: string
          day_number: number
          description: string | null
          id: string
          ingredients: string | null
          instructions: string | null
          kcal: number
          meal_name: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number: number
          description?: string | null
          id?: string
          ingredients?: string | null
          instructions?: string | null
          kcal: number
          meal_name: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          description?: string | null
          id?: string
          ingredients?: string | null
          instructions?: string | null
          kcal?: number
          meal_name?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_cards_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_compliance: {
        Row: {
          by_day: Json | null
          by_meal_type: Json | null
          calculated_at: string | null
          calorie_accuracy: number | null
          client_id: string
          id: string
          overall_compliance: number | null
          photo_compliance: number | null
          week_end: string
          week_start: string
        }
        Insert: {
          by_day?: Json | null
          by_meal_type?: Json | null
          calculated_at?: string | null
          calorie_accuracy?: number | null
          client_id: string
          id?: string
          overall_compliance?: number | null
          photo_compliance?: number | null
          week_end: string
          week_start: string
        }
        Update: {
          by_day?: Json | null
          by_meal_type?: Json | null
          calculated_at?: string | null
          calorie_accuracy?: number | null
          client_id?: string
          id?: string
          overall_compliance?: number | null
          photo_compliance?: number | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_compliance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_logs: {
        Row: {
          client_id: string
          created_at: string
          daily_log_id: string | null
          file_type: string | null
          id: string
          kcal: number | null
          logged_at: string
          meal_name: string | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          notes: string | null
          photo_url: string | null
          updated_at: string
          vision_tags: Json | null
        }
        Insert: {
          client_id: string
          created_at?: string
          daily_log_id?: string | null
          file_type?: string | null
          id?: string
          kcal?: number | null
          logged_at?: string
          meal_name?: string | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          photo_url?: string | null
          updated_at?: string
          vision_tags?: Json | null
        }
        Update: {
          client_id?: string
          created_at?: string
          daily_log_id?: string | null
          file_type?: string | null
          id?: string
          kcal?: number | null
          logged_at?: string
          meal_name?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          notes?: string | null
          photo_url?: string | null
          updated_at?: string
          vision_tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_logs_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          template: string
          trigger_event: string | null
          variables: string[] | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          template: string
          trigger_event?: string | null
          variables?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          template?: string
          trigger_event?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_type: string | null
          attachment_url: string | null
          batch_id: string | null
          client_id: string
          content: string
          created_at: string
          id: string
          is_bulk: boolean | null
          is_read: boolean
          message_type: string
          metadata: Json | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          batch_id?: string | null
          client_id: string
          content: string
          created_at?: string
          id?: string
          is_bulk?: boolean | null
          is_read?: boolean
          message_type: string
          metadata?: Json | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_type?: string | null
          attachment_url?: string | null
          batch_id?: string | null
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          is_bulk?: boolean | null
          is_read?: boolean
          message_type?: string
          metadata?: Json | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_review_cards: {
        Row: {
          ai_generated_at: string | null
          card_type: string
          client_id: string
          created_at: string | null
          generated_content: Json
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          status: string | null
          updated_at: string | null
          workflow_stage: string
        }
        Insert: {
          ai_generated_at?: string | null
          card_type: string
          client_id: string
          created_at?: string | null
          generated_content: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_stage: string
        }
        Update: {
          ai_generated_at?: string | null
          card_type?: string
          client_id?: string
          created_at?: string | null
          generated_content?: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_review_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_review_cards_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          client_id: string
          created_at: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          client_id: string
          created_at?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          client_id?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          name: string
          servings: number
          total_kcal: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name: string
          servings?: number
          total_kcal?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          servings?: number
          total_kcal?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          client_id: string
          earned_at: string
          id: string
          progress: Json | null
        }
        Insert: {
          achievement_id: string
          client_id: string
          earned_at?: string
          id?: string
          progress?: Json | null
        }
        Update: {
          achievement_id?: string
          client_id?: string
          earned_at?: string
          id?: string
          progress?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_plans: {
        Row: {
          client_id: string
          created_at: string
          end_date: string
          id: string
          pdf_url: string | null
          published_at: string | null
          start_date: string
          status: string | null
          total_kcal: number | null
          updated_at: string
          week_number: number
        }
        Insert: {
          client_id: string
          created_at?: string
          end_date: string
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          start_date: string
          status?: string | null
          total_kcal?: number | null
          updated_at?: string
          week_number: number
        }
        Update: {
          client_id?: string
          created_at?: string
          end_date?: string
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          start_date?: string
          status?: string | null
          total_kcal?: number | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          id: string
          client_id: string
          admin_id: string | null
          report_date: string
          summary: string | null
          content: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          admin_id?: string | null
          report_date?: string
          summary?: string | null
          content?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          admin_id?: string | null
          report_date?: string
          summary?: string | null
          content?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      workflow_history: {
        Row: {
          action: string
          client_id: string
          id: string
          metadata: Json | null
          triggered_at: string | null
          triggered_by: string | null
          workflow_stage: string
        }
        Insert: {
          action: string
          client_id: string
          id?: string
          metadata?: Json | null
          triggered_at?: string | null
          triggered_by?: string | null
          workflow_stage: string
        }
        Update: {
          action?: string
          client_id?: string
          id?: string
          metadata?: Json | null
          triggered_at?: string | null
          triggered_by?: string | null
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_admins: { Args: never; Returns: number }
      ensure_user_role: {
        Args: {
          p_user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_daily_metric: {
        Args: {
          p_client_id: string
          p_metric_type: string
          p_value: number
          p_date: string
        }
        Returns: Json
      }
    }
    Enums: {
      achievement_category: "consistency" | "milestone" | "streak" | "special"
      achievement_criteria_type:
      | "meal_log_streak"
      | "meal_log_count"
      | "hydration_streak"
      | "hydration_perfect_week"
      | "weight_loss_milestone"
      | "weight_consistency"
      | "activity_streak"
      | "activity_total_minutes"
      | "perfect_week"
      | "early_bird"
      | "first_meal"
      app_role: "admin" | "client" | "manager"
      assessment_request_status:
      | "pending"
      | "in_progress"
      | "completed"
      | "cancelled"
      assessment_type: "health" | "stress" | "sleep" | "custom"
      client_status: "active" | "inactive" | "pending" | "completed"
      community_group_role: "member" | "moderator" | "owner"
      community_notification_type:
      | "comment"
      | "reaction"
      | "dm"
      | "moderation_action"
      | "group_invite"
      | "mention"
      community_reaction_type: "like" | "love" | "celebrate"
      community_report_status: "open" | "reviewed" | "actioned"
      community_target_type: "post" | "comment" | "user"
      community_visibility: "public" | "archived"
      gender_type: "male" | "female" | "other"
      health_goal_type:
      | "weight_loss"
      | "muscle_gain"
      | "diabetes"
      | "pcos"
      | "lifestyle_correction"
      meal_type: "breakfast" | "lunch" | "evening_snack" | "dinner"
      program_type:
      | "weight_loss"
      | "weight_gain"
      | "maintenance"
      | "muscle_building"
      | "general_wellness"
      service_type: "consultation" | "hundred_days"
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
      achievement_category: ["consistency", "milestone", "streak", "special"],
      achievement_criteria_type: [
        "meal_log_streak",
        "meal_log_count",
        "hydration_streak",
        "hydration_perfect_week",
        "weight_loss_milestone",
        "weight_consistency",
        "activity_streak",
        "activity_total_minutes",
        "perfect_week",
        "early_bird",
        "first_meal",
      ],
      app_role: ["admin", "client", "manager"],
      assessment_request_status: [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
      ],
      assessment_type: ["health", "stress", "sleep", "custom"],
      client_status: ["active", "inactive", "pending", "completed"],
      community_group_role: ["member", "moderator", "owner"],
      community_notification_type: [
        "comment",
        "reaction",
        "dm",
        "moderation_action",
        "group_invite",
        "mention",
      ],
      community_reaction_type: ["like", "love", "celebrate"],
      community_report_status: ["open", "reviewed", "actioned"],
      community_target_type: ["post", "comment", "user"],
      community_visibility: ["public", "archived"],
      gender_type: ["male", "female", "other"],
      health_goal_type: [
        "weight_loss",
        "muscle_gain",
        "diabetes",
        "pcos",
        "lifestyle_correction",
      ],
      meal_type: ["breakfast", "lunch", "evening_snack", "dinner"],
      program_type: [
        "weight_loss",
        "weight_gain",
        "maintenance",
        "muscle_building",
        "general_wellness",
      ],
      service_type: ["consultation", "hundred_days"],
    },
  },
} as const
