
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"after_data": Json | null,"before_data": Json | null,"chain_pos": number,"changed_fields": (string)[],"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string | null,"prev_hash": string,"row_hash": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"chain_pos": number,"changed_fields"?: (string)[],"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string | null,"prev_hash": string,"row_hash": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"chain_pos"?: number,"changed_fields"?: (string)[],"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string | null,"prev_hash"?: string,"row_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"campaign_events": {
                  Row: {
                    "actor_id": string | null,"campaign_id": string,"chain_pos": number,"event_type": string,"from_status": string | null,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string,"prev_hash": string,"reason": string | null,"row_hash": string,"to_status": string | null
                  }
                  Insert: {
                    "actor_id"?: string | null,"campaign_id": string,"chain_pos"?: number,"event_type": string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id": string,"prev_hash"?: string,"reason"?: string | null,"row_hash"?: string,"to_status"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"campaign_id"?: string,"chain_pos"?: number,"event_type"?: string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string,"prev_hash"?: string,"reason"?: string | null,"row_hash"?: string,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_events_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"campaign_participants": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string | null,"goal_amount_cents": number | null,"household_id": string | null,"id": string,"organization_id": string,"player_id": string,"status": string,"team_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string | null,"goal_amount_cents"?: number | null,"household_id"?: string | null,"id"?: string,"organization_id": string,"player_id": string,"status"?: string,"team_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string | null,"goal_amount_cents"?: number | null,"household_id"?: string | null,"id"?: string,"organization_id"?: string,"player_id"?: string,"status"?: string,"team_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_participants_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_participants_household_id_organization_id_fkey"
      columns: ["household_id","organization_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_participants_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaign_participants_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_participants_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_participants_team_id_organization_id_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"campaign_sales": {
                  Row: {
                    "amount_cents": number,"buyer_email": string | null,"buyer_name": string,"buyer_phone": string | null,"campaign_id": string,"collection_event_id": string,"corrects_sale_id": string | null,"created_at": string,"created_by": string,"id": string,"idempotency_key": string,"notes": string | null,"organization_id": string,"participant_id": string,"payment_method": string,"quantity": number,"request_fingerprint": string,"sold_at": string
                  }
                  Insert: {
                    "amount_cents": number,"buyer_email"?: string | null,"buyer_name": string,"buyer_phone"?: string | null,"campaign_id": string,"collection_event_id": string,"corrects_sale_id"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"idempotency_key": string,"notes"?: string | null,"organization_id": string,"participant_id": string,"payment_method": string,"quantity": number,"request_fingerprint": string,"sold_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"buyer_email"?: string | null,"buyer_name"?: string,"buyer_phone"?: string | null,"campaign_id"?: string,"collection_event_id"?: string,"corrects_sale_id"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"idempotency_key"?: string,"notes"?: string | null,"organization_id"?: string,"participant_id"?: string,"payment_method"?: string,"quantity"?: number,"request_fingerprint"?: string,"sold_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_sales_collection_event_id_organization_id_campaig_fkey"
      columns: ["collection_event_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "campaign_sales_corrects_sale_id_organization_id_campaign_i_fkey"
      columns: ["corrects_sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "campaign_sales_corrects_sale_id_organization_id_campaign_i_fkey"
      columns: ["corrects_sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "campaign_sales_participant_id_organization_id_campaign_id_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"campaign_seller_links": {
                  Row: {
                    "campaign_id": string,"created_at": string,"expires_at": string,"id": string,"opaque_token_hash": string,"organization_id": string,"participant_id": string,"revoked_at": string | null,"seller_user_id": string
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"opaque_token_hash": string,"organization_id": string,"participant_id": string,"revoked_at"?: string | null,"seller_user_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"opaque_token_hash"?: string,"organization_id"?: string,"participant_id"?: string,"revoked_at"?: string | null,"seller_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_seller_links_participant_id_organization_id_campa_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"campaign_team_goals": {
                  Row: {
                    "campaign_id": string,"goal_amount_cents": number | null,"id": string,"organization_id": string,"team_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "campaign_id": string,"goal_amount_cents"?: number | null,"id"?: string,"organization_id": string,"team_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"goal_amount_cents"?: number | null,"id"?: string,"organization_id"?: string,"team_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_team_goals_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "campaign_team_goals_team_id_organization_id_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"campaign_ticket_counters": {
                  Row: {
                    "campaign_id": string,"next_sequence": number,"organization_id": string
                  }
                  Insert: {
                    "campaign_id": string,"next_sequence"?: number,"organization_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"next_sequence"?: number,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_ticket_counters_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "activated_at": string | null,"activated_by": string | null,"archived_at": string | null,"archived_by": string | null,"campaign_type": string,"closed_at": string | null,"closed_by": string | null,"created_at": string,"created_by": string | null,"default_allocation": number | null,"description": string | null,"draw_at": string | null,"drawn_at": string | null,"drawn_by": string | null,"family_target_tickets": number | null,"goal_amount_cents": number | null,"id": string,"jurisdiction_mode": string | null,"name": string,"operator_address": Json | null,"operator_legal_name": string | null,"organization_id": string,"player_goal_default_cents": number | null,"rules_text": string | null,"rules_version": number,"sales_close_at": string | null,"season_id": string | null,"settings": NonNullable<Json>,"starts_at": string | null,"status": string,"support_email": string | null,"support_phone": string | null,"team_goal_default_cents": number | null,"ticket_prefix": string | null,"ticket_price_cents": number | null,"timezone": string | null,"updated_at": string,"updated_by": string | null,"campaign_locked_fields": Json | null
                  }
                  Insert: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"archived_at"?: string | null,"archived_by"?: string | null,"campaign_type"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_allocation"?: number | null,"description"?: string | null,"draw_at"?: string | null,"drawn_at"?: string | null,"drawn_by"?: string | null,"family_target_tickets"?: number | null,"goal_amount_cents"?: number | null,"id"?: string,"jurisdiction_mode"?: string | null,"name": string,"operator_address"?: Json | null,"operator_legal_name"?: string | null,"organization_id": string,"player_goal_default_cents"?: number | null,"rules_text"?: string | null,"rules_version"?: number,"sales_close_at"?: string | null,"season_id"?: string | null,"settings"?: NonNullable<Json>,"starts_at"?: string | null,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"team_goal_default_cents"?: number | null,"ticket_prefix"?: string | null,"ticket_price_cents"?: number | null,"timezone"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"activated_by"?: string | null,"archived_at"?: string | null,"archived_by"?: string | null,"campaign_type"?: string,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"default_allocation"?: number | null,"description"?: string | null,"draw_at"?: string | null,"drawn_at"?: string | null,"drawn_by"?: string | null,"family_target_tickets"?: number | null,"goal_amount_cents"?: number | null,"id"?: string,"jurisdiction_mode"?: string | null,"name"?: string,"operator_address"?: Json | null,"operator_legal_name"?: string | null,"organization_id"?: string,"player_goal_default_cents"?: number | null,"rules_text"?: string | null,"rules_version"?: number,"sales_close_at"?: string | null,"season_id"?: string | null,"settings"?: NonNullable<Json>,"starts_at"?: string | null,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"team_goal_default_cents"?: number | null,"ticket_prefix"?: string | null,"ticket_price_cents"?: number | null,"timezone"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaigns_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campaigns_season_id_organization_id_fkey"
      columns: ["season_id","organization_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"drawing_events": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string,"event_type": string,"id": string,"idempotency_key": string,"metadata": NonNullable<Json>,"organization_id": string,"reason": string | null,"request_fingerprint": string,"snapshot_id": string
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string,"event_type": string,"id"?: string,"idempotency_key": string,"metadata"?: NonNullable<Json>,"organization_id": string,"reason"?: string | null,"request_fingerprint": string,"snapshot_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string,"event_type"?: string,"id"?: string,"idempotency_key"?: string,"metadata"?: NonNullable<Json>,"organization_id"?: string,"reason"?: string | null,"request_fingerprint"?: string,"snapshot_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drawing_events_snapshot_id_organization_id_campaign_id_fkey"
      columns: ["snapshot_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "drawing_snapshots"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"drawing_results": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string,"drawn_at": string,"evidence_ref": string | null,"id": string,"idempotency_key": string,"location": string,"method": string,"operator_name": string,"organization_id": string,"reason": string,"request_fingerprint": string,"result": string,"result_hash": string,"snapshot_id": string,"ticket_number": string,"winning_ticket_id": string,"witnesses": NonNullable<Json>
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string,"drawn_at": string,"evidence_ref"?: string | null,"id"?: string,"idempotency_key": string,"location": string,"method": string,"operator_name": string,"organization_id": string,"reason": string,"request_fingerprint": string,"result": string,"result_hash": string,"snapshot_id": string,"ticket_number": string,"winning_ticket_id": string,"witnesses": NonNullable<Json>
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string,"drawn_at"?: string,"evidence_ref"?: string | null,"id"?: string,"idempotency_key"?: string,"location"?: string,"method"?: string,"operator_name"?: string,"organization_id"?: string,"reason"?: string,"request_fingerprint"?: string,"result"?: string,"result_hash"?: string,"snapshot_id"?: string,"ticket_number"?: string,"winning_ticket_id"?: string,"witnesses"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "drawing_results_snapshot_id_organization_id_campaign_id_fkey"
      columns: ["snapshot_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "drawing_snapshots"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "drawing_results_snapshot_id_winning_ticket_id_organization_fkey"
      columns: ["snapshot_id","winning_ticket_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "drawing_snapshot_entries"
      referencedColumns: ["snapshot_id","ticket_id","organization_id","campaign_id"]
    }
                  ]
                },"drawing_snapshot_entries": {
                  Row: {
                    "buyer_email": string | null,"buyer_name": string,"buyer_phone": string | null,"campaign_id": string,"entry_hash": string,"face_value_cents": number,"issued_at": string,"organization_id": string,"participant_id": string,"player_id": string,"player_name": string,"sale_id": string,"seller_user_id": string,"sequence_number": number,"snapshot_id": string,"team_id": string | null,"team_name": string | null,"ticket_id": string,"ticket_number": string
                  }
                  Insert: {
                    "buyer_email"?: string | null,"buyer_name": string,"buyer_phone"?: string | null,"campaign_id": string,"entry_hash": string,"face_value_cents": number,"issued_at": string,"organization_id": string,"participant_id": string,"player_id": string,"player_name": string,"sale_id": string,"seller_user_id": string,"sequence_number": number,"snapshot_id": string,"team_id"?: string | null,"team_name"?: string | null,"ticket_id": string,"ticket_number": string
                  }
                  Update: {
                    "buyer_email"?: string | null,"buyer_name"?: string,"buyer_phone"?: string | null,"campaign_id"?: string,"entry_hash"?: string,"face_value_cents"?: number,"issued_at"?: string,"organization_id"?: string,"participant_id"?: string,"player_id"?: string,"player_name"?: string,"sale_id"?: string,"seller_user_id"?: string,"sequence_number"?: number,"snapshot_id"?: string,"team_id"?: string | null,"team_name"?: string | null,"ticket_id"?: string,"ticket_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drawing_snapshot_entries_participant_id_organization_id_ca_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_sale_id_organization_id_campaign__fkey"
      columns: ["sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_sale_id_organization_id_campaign__fkey"
      columns: ["sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_snapshot_id_organization_id_campa_fkey"
      columns: ["snapshot_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "drawing_snapshots"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_team_id_organization_id_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "drawing_snapshot_entries_ticket_id_organization_id_campaig_fkey"
      columns: ["ticket_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"drawing_snapshots": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string,"disclosures": NonNullable<Json>,"id": string,"idempotency_key": string,"manifest": NonNullable<Json>,"manifest_hash": string,"organization_id": string,"prize_readiness_confirmed": boolean,"reason": string,"request_fingerprint": string,"source_ledger_heads": NonNullable<Json>,"supersedes_snapshot_id": string | null,"ticket_count": number,"total_face_value_cents": number,"version": number
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string,"disclosures": NonNullable<Json>,"id"?: string,"idempotency_key": string,"manifest": NonNullable<Json>,"manifest_hash": string,"organization_id": string,"prize_readiness_confirmed": boolean,"reason": string,"request_fingerprint": string,"source_ledger_heads": NonNullable<Json>,"supersedes_snapshot_id"?: string | null,"ticket_count": number,"total_face_value_cents": number,"version": number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string,"disclosures"?: NonNullable<Json>,"id"?: string,"idempotency_key"?: string,"manifest"?: NonNullable<Json>,"manifest_hash"?: string,"organization_id"?: string,"prize_readiness_confirmed"?: boolean,"reason"?: string,"request_fingerprint"?: string,"source_ledger_heads"?: NonNullable<Json>,"supersedes_snapshot_id"?: string | null,"ticket_count"?: number,"total_face_value_cents"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "drawing_snapshots_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "drawing_snapshots_supersedes_snapshot_id_organization_id_c_fkey"
      columns: ["supersedes_snapshot_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "drawing_snapshots"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"guardian_user_links": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"created_at": string,"created_by": string | null,"guardian_id": string,"id": string,"member_id": string,"organization_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"guardian_id": string,"id"?: string,"member_id": string,"organization_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"guardian_id"?: string,"id"?: string,"member_id"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardian_user_links_guardian_id_organization_id_fkey"
      columns: ["guardian_id","organization_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "guardian_user_links_member_id_organization_id_fkey"
      columns: ["member_id","organization_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "guardian_user_links_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "archived_at": string | null,"communication_preferences": NonNullable<Json>,"created_at": string,"created_by": string | null,"email": string | null,"email_normalized": string | null,"first_name": string,"household_id": string | null,"id": string,"is_primary_contact": boolean,"last_name": string,"notes": string | null,"organization_id": string,"phone": string | null,"phone_digits": string | null,"profile_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"communication_preferences"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"email_normalized"?: never,"first_name": string,"household_id"?: string | null,"id"?: string,"is_primary_contact"?: boolean,"last_name": string,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"phone_digits"?: never,"profile_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"communication_preferences"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"email_normalized"?: never,"first_name"?: string,"household_id"?: string | null,"id"?: string,"is_primary_contact"?: boolean,"last_name"?: string,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"phone_digits"?: never,"profile_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_household_id_organization_id_fkey"
      columns: ["household_id","organization_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "guardians_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guardians_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "address_line1": string | null,"address_line2": string | null,"archived_at": string | null,"city": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"notes": string | null,"organization_id": string,"postal_code": string | null,"region": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"organization_id": string,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"import_mappings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"header_signature": string | null,"id": string,"last_used_at": string | null,"mapping": NonNullable<Json>,"name": string,"organization_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"header_signature"?: string | null,"id"?: string,"last_used_at"?: string | null,"mapping": NonNullable<Json>,"name": string,"organization_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"header_signature"?: string | null,"id"?: string,"last_used_at"?: string | null,"mapping"?: NonNullable<Json>,"name"?: string,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_mappings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"import_rows": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"household_key": string | null,"id": string,"import_id": string,"issues": NonNullable<Json>,"match_player_id": string | null,"match_reasons": (string)[],"match_type": string | null,"organization_id": string,"raw": NonNullable<Json>,"resolution": string | null,"result_player_id": string | null,"row_number": number,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"household_key"?: string | null,"id"?: string,"import_id": string,"issues"?: NonNullable<Json>,"match_player_id"?: string | null,"match_reasons"?: (string)[],"match_type"?: string | null,"organization_id": string,"raw": NonNullable<Json>,"resolution"?: string | null,"result_player_id"?: string | null,"row_number": number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"household_key"?: string | null,"id"?: string,"import_id"?: string,"issues"?: NonNullable<Json>,"match_player_id"?: string | null,"match_reasons"?: (string)[],"match_type"?: string | null,"organization_id"?: string,"raw"?: NonNullable<Json>,"resolution"?: string | null,"result_player_id"?: string | null,"row_number"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_import_id_organization_id_fkey"
      columns: ["import_id","organization_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "import_rows_match_player_id_organization_id_fkey"
      columns: ["match_player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "import_rows_match_player_id_organization_id_fkey"
      columns: ["match_player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "import_rows_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_result_player_id_organization_id_fkey"
      columns: ["result_player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "import_rows_result_player_id_organization_id_fkey"
      columns: ["result_player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "column_mapping": NonNullable<Json>,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"file_name": string,"headers": (string)[],"id": string,"kind": string,"mapping_id": string | null,"organization_id": string,"row_count": number,"source_name": string | null,"status": string,"summary": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "column_mapping"?: NonNullable<Json>,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name": string,"headers"?: (string)[],"id"?: string,"kind"?: string,"mapping_id"?: string | null,"organization_id": string,"row_count"?: number,"source_name"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "column_mapping"?: NonNullable<Json>,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"headers"?: (string)[],"id"?: string,"kind"?: string,"mapping_id"?: string | null,"organization_id"?: string,"row_count"?: number,"source_name"?: string | null,"status"?: string,"summary"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_mapping_id_fkey"
      columns: ["mapping_id"]
isOneToOne: false
      referencedRelation: "import_mappings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"money_custody_allocations": {
                  Row: {
                    "amount_cents": number,"bucket": string,"campaign_id": string,"event_id": string,"id": string,"organization_id": string,"receipt_id": string | null,"sale_id": string
                  }
                  Insert: {
                    "amount_cents": number,"bucket": string,"campaign_id": string,"event_id": string,"id"?: string,"organization_id": string,"receipt_id"?: string | null,"sale_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"bucket"?: string,"campaign_id"?: string,"event_id"?: string,"id"?: string,"organization_id"?: string,"receipt_id"?: string | null,"sale_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_custody_allocations_event_id_organization_id_campaig_fkey"
      columns: ["event_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_custody_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_allocations_receipt_id_organization_id_campa_fkey"
      columns: ["receipt_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_custody_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_allocations_sale_id_organization_id_campaign_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_allocations_sale_id_organization_id_campaign_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"money_custody_events": {
                  Row: {
                    "actor_id": string,"amount_cents": number,"campaign_id": string,"exception_id": string | null,"id": string,"idempotency_key": string,"kind": string,"occurred_at": string,"organization_id": string,"payment_method": string | null,"reason": string,"receipt_id": string | null,"reference": string | null,"request_fingerprint": string,"sale_id": string | null,"seller_id": string,"target_sale_id": string | null
                  }
                  Insert: {
                    "actor_id": string,"amount_cents": number,"campaign_id": string,"exception_id"?: string | null,"id"?: string,"idempotency_key": string,"kind": string,"occurred_at"?: string,"organization_id": string,"payment_method"?: string | null,"reason": string,"receipt_id"?: string | null,"reference"?: string | null,"request_fingerprint": string,"sale_id"?: string | null,"seller_id": string,"target_sale_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"amount_cents"?: number,"campaign_id"?: string,"exception_id"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"occurred_at"?: string,"organization_id"?: string,"payment_method"?: string | null,"reason"?: string,"receipt_id"?: string | null,"reference"?: string | null,"request_fingerprint"?: string,"sale_id"?: string | null,"seller_id"?: string,"target_sale_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_custody_events_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "money_custody_events_exception_id_organization_id_campaign_fkey"
      columns: ["exception_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_custody_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_custody_events_receipt_id_organization_id_campaign_i_fkey"
      columns: ["receipt_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_custody_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_events_sale_id_organization_id_campaign_id_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_events_sale_id_organization_id_campaign_id_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_events_target_sale_id_organization_id_campai_fkey"
      columns: ["target_sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_custody_events_target_sale_id_organization_id_campai_fkey"
      columns: ["target_sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"money_events": {
                  Row: {
                    "actor_id": string | null,"amount_cents": number,"approved_by": string | null,"batch_ref": string | null,"campaign_id": string,"chain_pos": number,"event_type": string,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string,"participant_id": string | null,"payment_method": string | null,"prev_hash": string,"reason": string | null,"reverses_event_id": string | null,"row_hash": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"amount_cents": number,"approved_by"?: string | null,"batch_ref"?: string | null,"campaign_id": string,"chain_pos"?: number,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id": string,"participant_id"?: string | null,"payment_method"?: string | null,"prev_hash"?: string,"reason"?: string | null,"reverses_event_id"?: string | null,"row_hash"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"amount_cents"?: number,"approved_by"?: string | null,"batch_ref"?: string | null,"campaign_id"?: string,"chain_pos"?: number,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string,"participant_id"?: string | null,"payment_method"?: string | null,"prev_hash"?: string,"reason"?: string | null,"reverses_event_id"?: string | null,"row_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_events_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "money_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_events_participant_scope_fk"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "money_events_reverses_event_id_fkey"
      columns: ["reverses_event_id"]
isOneToOne: false
      referencedRelation: "money_events"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"last_sent_at": string | null,"organization_id": string,"revoked_at": string | null,"role_keys": (string)[],"send_count": number,"status": string,"updated_at": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"last_sent_at"?: string | null,"organization_id": string,"revoked_at"?: string | null,"role_keys": (string)[],"send_count"?: number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"last_sent_at"?: string | null,"organization_id"?: string,"revoked_at"?: string | null,"role_keys"?: (string)[],"send_count"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_member_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"member_id": string,"organization_id": string,"role_key": string,"role_scope": string
                  }
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"member_id": string,"organization_id": string,"role_key": string,"role_scope"?: string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"member_id"?: string,"organization_id"?: string,"role_key"?: string,"role_scope"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_member_roles_member_id_organization_id_fkey"
      columns: ["member_id","organization_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "organization_member_roles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_member_roles_role_key_role_scope_fkey"
      columns: ["role_key","role_scope"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key","scope"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"organization_id": string,"status": string,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address_line1": string | null,"address_line2": string | null,"archived_at": string | null,"city": string | null,"country": string,"created_at": string,"created_by": string | null,"id": string,"jurisdiction_profile": string | null,"legal_name": string | null,"name": string,"organization_type": string,"platform_config": NonNullable<Json>,"postal_code": string | null,"region": string | null,"settings": NonNullable<Json>,"slug": string,"status": string,"support_email": string | null,"support_phone": string | null,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"jurisdiction_profile"?: string | null,"legal_name"?: string | null,"name": string,"organization_type"?: string,"platform_config"?: NonNullable<Json>,"postal_code"?: string | null,"region"?: string | null,"settings"?: NonNullable<Json>,"slug": string,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"jurisdiction_profile"?: string | null,"legal_name"?: string | null,"name"?: string,"organization_type"?: string,"platform_config"?: NonNullable<Json>,"postal_code"?: string | null,"region"?: string | null,"settings"?: NonNullable<Json>,"slug"?: string,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string,"scope": string
                  }
                  Insert: {
                    "category": string,"description"?: string,"key": string,"scope"?: string
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string,"scope"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"created_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"player_duplicate_dismissals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"organization_id": string,"player_a_id": string,"player_b_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"organization_id": string,"player_a_id": string,"player_b_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"organization_id"?: string,"player_a_id"?: string,"player_b_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_duplicate_dismissals_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_duplicate_dismissals_player_a_id_organization_id_fkey"
      columns: ["player_a_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "player_duplicate_dismissals_player_a_id_organization_id_fkey"
      columns: ["player_a_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "player_duplicate_dismissals_player_b_id_organization_id_fkey"
      columns: ["player_b_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "player_duplicate_dismissals_player_b_id_organization_id_fkey"
      columns: ["player_b_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"player_guardians": {
                  Row: {
                    "created_at": string,"created_by": string | null,"guardian_id": string,"is_primary": boolean,"organization_id": string,"player_id": string,"relationship": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"guardian_id": string,"is_primary"?: boolean,"organization_id": string,"player_id": string,"relationship"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"guardian_id"?: string,"is_primary"?: boolean,"organization_id"?: string,"player_id"?: string,"relationship"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_guardians_guardian_id_organization_id_fkey"
      columns: ["guardian_id","organization_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "player_guardians_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_guardians_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "player_guardians_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"players": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"date_of_birth": string | null,"external_player_id": string | null,"first_name": string,"gender": string | null,"household_id": string | null,"id": string,"last_name": string,"notes": string | null,"organization_id": string,"preferred_name": string | null,"source": string,"source_import_id": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_birth"?: string | null,"external_player_id"?: string | null,"first_name": string,"gender"?: string | null,"household_id"?: string | null,"id"?: string,"last_name": string,"notes"?: string | null,"organization_id": string,"preferred_name"?: string | null,"source"?: string,"source_import_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_birth"?: string | null,"external_player_id"?: string | null,"first_name"?: string,"gender"?: string | null,"household_id"?: string | null,"id"?: string,"last_name"?: string,"notes"?: string | null,"organization_id"?: string,"preferred_name"?: string | null,"source"?: string,"source_import_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_household_id_organization_id_fkey"
      columns: ["household_id","organization_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "players_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_source_import_fk"
      columns: ["source_import_id","organization_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"last_organization_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"last_organization_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"last_organization_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_last_organization_fk"
      columns: ["last_organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role_key": string
                  }
                  Insert: {
                    "permission_key": string,"role_key": string
                  }
                  Update: {
                    "permission_key"?: string,"role_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key"]
    }
                  ]
                },"roles": {
                  Row: {
                    "description": string,"key": string,"name": string,"scope": string,"sort_order": number
                  }
                  Insert: {
                    "description"?: string,"key": string,"name": string,"scope": string,"sort_order"?: number
                  }
                  Update: {
                    "description"?: string,"key"?: string,"name"?: string,"scope"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sale_reversals": {
                  Row: {
                    "approved_by": string,"campaign_id": string,"collection_event_id": string,"created_at": string,"created_by": string,"id": string,"organization_id": string,"reason": string,"reversal_event_id": string,"sale_id": string
                  }
                  Insert: {
                    "approved_by": string,"campaign_id": string,"collection_event_id": string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id": string,"reason": string,"reversal_event_id": string,"sale_id": string
                  }
                  Update: {
                    "approved_by"?: string,"campaign_id"?: string,"collection_event_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id"?: string,"reason"?: string,"reversal_event_id"?: string,"sale_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_reversals_collection_event_id_organization_id_campaig_fkey"
      columns: ["collection_event_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "sale_reversals_reversal_event_id_organization_id_campaign__fkey"
      columns: ["reversal_event_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_events"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "sale_reversals_sale_id_organization_id_campaign_id_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "sale_reversals_sale_id_organization_id_campaign_id_fkey"
      columns: ["sale_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"ends_on": string | null,"id": string,"is_current": boolean,"name": string,"organization_id": string,"starts_on": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"is_current"?: boolean,"name": string,"organization_id": string,"starts_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"id"?: string,"is_current"?: boolean,"name"?: string,"organization_id"?: string,"starts_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "seasons_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_interest_requests": {
                  Row: {
                    "campaign_id": string,"created_at": string,"id": string,"note": string,"organization_id": string,"participant_id": string,"preferred_contact": string,"request_fingerprint": string,"requested_quantity": number,"seller_link_id": string,"submission_key": string,"supporter_email": string | null,"supporter_name": string,"supporter_phone": string | null
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"id"?: string,"note"?: string,"organization_id": string,"participant_id": string,"preferred_contact": string,"request_fingerprint": string,"requested_quantity": number,"seller_link_id": string,"submission_key": string,"supporter_email"?: string | null,"supporter_name": string,"supporter_phone"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"id"?: string,"note"?: string,"organization_id"?: string,"participant_id"?: string,"preferred_contact"?: string,"request_fingerprint"?: string,"requested_quantity"?: number,"seller_link_id"?: string,"submission_key"?: string,"supporter_email"?: string | null,"supporter_name"?: string,"supporter_phone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_interest_requests_seller_link_id_organization_id_ca_fkey"
      columns: ["seller_link_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "campaign_seller_links"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    }
                  ]
                },"seller_request_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"id": string,"organization_id": string,"request_id": string,"sale_id": string | null,"status": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"organization_id": string,"request_id": string,"sale_id"?: string | null,"status": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"id"?: string,"organization_id"?: string,"request_id"?: string,"sale_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_request_events_request_id_organization_id_fkey"
      columns: ["request_id","organization_id"]
isOneToOne: false
      referencedRelation: "seller_interest_requests"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "seller_request_events_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_request_events_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_request_limits": {
                  Row: {
                    "attempts": number,"bucket": string,"window_at": string
                  }
                  Insert: {
                    "attempts": number,"bucket": string,"window_at": string
                  }
                  Update: {
                    "attempts"?: number,"bucket"?: string,"window_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"team_memberships": {
                  Row: {
                    "created_at": string,"created_by": string | null,"end_reason": string | null,"ended_at": string | null,"id": string,"organization_id": string,"player_id": string,"started_at": string,"team_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"organization_id": string,"player_id": string,"started_at"?: string,"team_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"organization_id"?: string,"player_id"?: string,"started_at"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_memberships_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "player_directory"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "team_memberships_player_id_organization_id_fkey"
      columns: ["player_id","organization_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "team_memberships_team_id_organization_id_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"team_staff_assignments": {
                  Row: {
                    "archived_at": string | null,"archived_by": string | null,"created_at": string,"created_by": string | null,"id": string,"member_id": string,"organization_id": string,"team_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id": string,"organization_id": string,"team_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"archived_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"member_id"?: string,"organization_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_staff_assignments_member_id_organization_id_fkey"
      columns: ["member_id","organization_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "team_staff_assignments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_staff_assignments_team_id_organization_id_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "age_group": string | null,"archived_at": string | null,"coach_name": string | null,"created_at": string,"created_by": string | null,"gender_division": string | null,"id": string,"name": string,"notes": string | null,"organization_id": string,"season_id": string | null,"status": string,"team_code": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "age_group"?: string | null,"archived_at"?: string | null,"coach_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"gender_division"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"organization_id": string,"season_id"?: string | null,"status"?: string,"team_code"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "age_group"?: string | null,"archived_at"?: string | null,"coach_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"gender_division"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"season_id"?: string | null,"status"?: string,"team_code"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_season_id_organization_id_fkey"
      columns: ["season_id","organization_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"ticket_allocations": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string,"id": string,"organization_id": string,"participant_id": string,"quantity": number
                  }
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id": string,"participant_id": string,"quantity": number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id"?: string,"participant_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_allocations_participant_id_organization_id_campaign_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"ticket_events": {
                  Row: {
                    "actor_id": string | null,"campaign_id": string,"chain_pos": number,"event_type": string,"id": string,"idempotency_key": string | null,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string,"participant_id": string | null,"prev_hash": string,"reason": string | null,"replaces_ticket_id": string | null,"row_hash": string,"ticket_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"campaign_id": string,"chain_pos"?: number,"event_type": string,"id"?: string,"idempotency_key"?: string | null,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id": string,"participant_id"?: string | null,"prev_hash"?: string,"reason"?: string | null,"replaces_ticket_id"?: string | null,"row_hash"?: string,"ticket_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"campaign_id"?: string,"chain_pos"?: number,"event_type"?: string,"id"?: string,"idempotency_key"?: string | null,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string,"participant_id"?: string | null,"prev_hash"?: string,"reason"?: string | null,"replaces_ticket_id"?: string | null,"row_hash"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_events_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "ticket_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tickets": {
                  Row: {
                    "allocation_id": string | null,"campaign_id": string,"created_at": string,"created_by": string,"id": string,"organization_id": string,"participant_id": string | null,"sale_id": string | null,"sequence_number": number,"status": string,"ticket_number": string
                  }
                  Insert: {
                    "allocation_id"?: string | null,"campaign_id": string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id": string,"participant_id"?: string | null,"sale_id"?: string | null,"sequence_number": number,"status"?: string,"ticket_number": string
                  }
                  Update: {
                    "allocation_id"?: string | null,"campaign_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"organization_id"?: string,"participant_id"?: string | null,"sale_id"?: string | null,"sequence_number"?: number,"status"?: string,"ticket_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_allocation_id_organization_id_campaign_id_particip_fkey"
      columns: ["allocation_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "ticket_allocations"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "tickets_campaign_id_organization_id_fkey"
      columns: ["campaign_id","organization_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "tickets_participant_id_organization_id_campaign_id_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    },{
      foreignKeyName: "tickets_sale_id_organization_id_campaign_id_participant_id_fkey"
      columns: ["sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "campaign_sales"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    },{
      foreignKeyName: "tickets_sale_id_organization_id_campaign_id_participant_id_fkey"
      columns: ["sale_id","organization_id","campaign_id","participant_id"]
isOneToOne: false
      referencedRelation: "money_sale_balances"
      referencedColumns: ["id","organization_id","campaign_id","participant_id"]
    }
                  ]
                }
          }
          Views: {
            "money_sale_balances": {
                  Row: {
                    "adjustment_cents": number | null,"campaign_id": string | null,"deposited_cents": number | null,"exception_cents": number | null,"expected_cents": number | null,"id": string | null,"organization_id": string | null,"participant_id": string | null,"payment_method": string | null,"received_cents": number | null,"recorded_cents": number | null,"seller_id": string | null,"sold_at": string | null,"uncleared_cents": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_sales_participant_id_organization_id_campaign_id_fkey"
      columns: ["participant_id","organization_id","campaign_id"]
isOneToOne: false
      referencedRelation: "campaign_participants"
      referencedColumns: ["id","organization_id","campaign_id"]
    }
                  ]
                },"player_directory": {
                  Row: {
                    "archived_at": string | null,"created_at": string | null,"date_of_birth": string | null,"external_player_id": string | null,"first_name": string | null,"gender": string | null,"household_id": string | null,"household_name": string | null,"id": string | null,"last_name": string | null,"notes": string | null,"organization_id": string | null,"preferred_name": string | null,"primary_guardian_email": string | null,"primary_guardian_id": string | null,"primary_guardian_name": string | null,"primary_guardian_phone": string | null,"search_text": string | null,"season_id": string | null,"season_name": string | null,"source": string | null,"source_import_id": string | null,"status": string | null,"team_id": string | null,"team_name": string | null,"updated_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_household_id_organization_id_fkey"
      columns: ["household_id","organization_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "players_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_source_import_fk"
      columns: ["source_import_id","organization_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"add_organization_member":
{ Args: { "p_organization_id": string,"p_reason"?: string,"p_roles": (string)[],"p_user_id": string }; Returns: string
                           },
"add_players_to_household":
{ Args: { "p_household_id": string,"p_organization_id": string,"p_player_ids": (string)[] }; Returns: number
                           },
"allocate_campaign_tickets":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_participant_id": string,"p_quantity": number }; Returns: string
                           },
"archive_team":
{ Args: { "p_organization_id": string,"p_team_id": string }; Returns: number
                           },
"assert_org_permission":
{ Args: { "p_organization_id": string,"p_permission": string }; Returns: undefined
                           },
"audit_chain_hash_at":
{ Args: { "p_chain_pos": number,"p_organization_id": string }; Returns: string
                           },
"audit_checkpoint_rows":
{ Args: Record<PropertyKey, never>; Returns: {
              "first_bad_pos": number,"head_hash": string,"last_chain_pos": number,"ok": boolean,"organization_id": string,"organization_name": string,"organization_slug": string,"rows_checked": number
            }[]
                           },
"audit_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"audit_schema_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"bulk_set_player_team":
{ Args: { "p_organization_id": string,"p_player_ids": (string)[],"p_team_id": string }; Returns: number
                           },
"campaign_locked_fields":
{ Args: { "c": Database["public"]['Tables']["campaigns"]['Row'] }; Returns: Json
                           },
"campaign_money":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_view"?: string }; Returns: Json
                           },
"campaign_progress":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_player_id"?: string,"p_team_id"?: string,"p_view"?: string }; Returns: Json
                           },
"campaign_readiness":
{ Args: { "p_campaign_id": string }; Returns: (string)[]
                           },
"campaign_transition_allowed":
{ Args: { "p_from": string,"p_to": string }; Returns: boolean
                           },
"can_access_household":
{ Args: { "p_household_id": string }; Returns: boolean
                           },
"can_access_player":
{ Args: { "p_player_id": string }; Returns: boolean
                           },
"can_access_team":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"can_assign_role":
{ Args: { "p_organization_id": string,"p_role_key": string }; Returns: boolean
                           },
"can_issue_campaign_participant":
{ Args: { "p_organization_id": string,"p_participant_id": string }; Returns: boolean
                           },
"can_manage_seller_participant":
{ Args: { "p_org": string,"p_participant": string }; Returns: boolean
                           },
"can_read_fundraising_participant":
{ Args: { "p_participant_id": string,"p_view"?: string }; Returns: boolean
                           },
"can_read_fundraising_sale":
{ Args: { "p_sale_id": string }; Returns: boolean
                           },
"certify_drawing":
{ Args: { "p_idempotency_key": string,"p_organization_id": string,"p_reason": string,"p_snapshot_id": string }; Returns: Json
                           },
"chain_payload":
{ Args: { "p_row": Json }; Returns: string
                           },
"commit_player_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"create_guardian":
{ Args: { "p_guardian": Json,"p_household_id": string,"p_make_primary"?: boolean,"p_organization_id": string,"p_player_ids"?: (string)[] }; Returns: string
                           },
"create_player":
{ Args: { "p_guardian"?: Json,"p_household"?: Json,"p_organization_id": string,"p_player": Json,"p_team_id"?: string }; Returns: string
                           },
"drawing_current_snapshot":
{ Args: { "p_campaign_id": string }; Returns: string
                           },
"drawing_eligible_entries":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_snapshot_id": string }; Returns: {
              "buyer_email": string | null,
"buyer_name": string,
"buyer_phone": string | null,
"campaign_id": string,
"entry_hash": string,
"face_value_cents": number,
"issued_at": string,
"organization_id": string,
"participant_id": string,
"player_id": string,
"player_name": string,
"sale_id": string,
"seller_user_id": string,
"sequence_number": number,
"snapshot_id": string,
"team_id": string | null,
"team_name": string | null,
"ticket_id": string,
"ticket_number": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "drawing_snapshot_entries"
        isOneToOne: false
        isSetofReturn: true
      } },
"drawing_has_export_authority":
{ Args: { "p_organization_id": string }; Returns: boolean
                           },
"drawing_integrity":
{ Args: { "p_snapshot_id": string }; Returns: Json
                           },
"drawing_lock_campaign":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_permission": string }; Returns: {
              "activated_at": string | null,
"activated_by": string | null,
"archived_at": string | null,
"archived_by": string | null,
"campaign_type": string,
"closed_at": string | null,
"closed_by": string | null,
"created_at": string,
"created_by": string | null,
"default_allocation": number | null,
"description": string | null,
"draw_at": string | null,
"drawn_at": string | null,
"drawn_by": string | null,
"family_target_tickets": number | null,
"goal_amount_cents": number | null,
"id": string,
"jurisdiction_mode": string | null,
"name": string,
"operator_address": Json | null,
"operator_legal_name": string | null,
"organization_id": string,
"player_goal_default_cents": number | null,
"rules_text": string | null,
"rules_version": number,
"sales_close_at": string | null,
"season_id": string | null,
"settings": NonNullable<Json>,
"starts_at": string | null,
"status": string,
"support_email": string | null,
"support_phone": string | null,
"team_goal_default_cents": number | null,
"ticket_prefix": string | null,
"ticket_price_cents": number | null,
"timezone": string | null,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "campaigns"
        isOneToOne: true
        isSetofReturn: false
      } },
"drawing_manifest":
{ Args: { "p_entries_hash": string,"p_snapshot": Database["public"]['Tables']["drawing_snapshots"]['Row'] }; Returns: Json
                           },
"drawing_overview":
{ Args: { "p_campaign_id": string,"p_organization_id": string }; Returns: Json
                           },
"drawing_readiness":
{ Args: { "p_campaign_id": string,"p_organization_id": string }; Returns: Json
                           },
"drawing_snapshot_export":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_snapshot_id": string }; Returns: Json
                           },
"drawing_source_heads":
{ Args: { "p_campaign_id": string,"p_organization_id": string }; Returns: Json
                           },
"drawing_validate_request":
{ Args: { "p_key": string,"p_reason": string }; Returns: undefined
                           },
"enroll_campaign_players":
{ Args: { "p_all_active"?: boolean,"p_campaign_id": string,"p_goal_amount_cents"?: number,"p_organization_id": string,"p_player_ids"?: (string)[],"p_team_ids"?: (string)[] }; Returns: number
                           },
"escape_like":
{ Args: { "p_text": string }; Returns: string
                           },
"export_drawing_snapshot":
{ Args: { "p_export_sha256": string,"p_format": string,"p_idempotency_key": string,"p_organization_id": string,"p_snapshot_id": string }; Returns: Json
                           },
"freeze_drawing":
{ Args: { "p_campaign_id": string,"p_idempotency_key": string,"p_organization_id": string,"p_prize_readiness_confirmed"?: boolean,"p_reason": string }; Returns: Json
                           },
"fundraising_campaigns":
{ Args: { "p_organization_id": string,"p_view"?: string }; Returns: Json
                           },
"generate_campaign_tickets":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_quantity": number }; Returns: number
                           },
"has_org_permission":
{ Args: { "p_organization_id": string,"p_permission": string }; Returns: boolean
                           },
"has_platform_permission":
{ Args: { "p_permission": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_organization_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"link_family_guardian":
{ Args: { "p_guardian_id": string,"p_member_id": string,"p_reason"?: string }; Returns: string
                           },
"list_households":
{ Args: { "p_archived"?: boolean,"p_issue"?: string,"p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_q"?: string }; Returns: Json
                           },
"list_org_members":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_organization_id": string,"p_q"?: string }; Returns: Json
                           },
"list_possible_duplicates":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_organization_id": string }; Returns: Json
                           },
"lock_fundraising_membership":
{ Args: { "p_organization_id": string }; Returns: string
                           },
"manage_seller_link":
{ Args: { "p_organization_id": string,"p_participant_id": string,"p_revoke"?: boolean }; Returns: Json
                           },
"my_assigned_team_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_family_guardian_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_family_household_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_family_player_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_org_permissions":
{ Args: { "p_organization_id": string }; Returns: (string)[]
                           },
"my_org_roles":
{ Args: { "p_organization_id": string }; Returns: (string)[]
                           },
"my_scoped_guardian_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_scoped_household_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_scoped_player_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_scoped_team_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_team_player_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"platform_organization_summaries":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"jurisdiction_profile": string,"member_count": number,"name": string,"organization_type": string,"pending_invitations": number,"player_count": number,"slug": string,"status": string
            }[]
                           },
"platform_update_organization":
{ Args: { "p_changes": Json,"p_organization_id": string,"p_reason": string }; Returns: undefined
                           },
"possible_duplicate_players":
{ Args: { "p_organization_id": string }; Returns: {
              "player_a_id": string,"player_b_id": string,"reason": string
            }[]
                           },
"prepare_campaign_inventory":
{ Args: { "p_campaign_id": string,"p_organization_id": string }; Returns: number
                           },
"public_seller_page":
{ Args: { "p_token": string }; Returns: Json
                           },
"record_campaign_sale":
{ Args: { "p_amount_cents": number,"p_buyer_email"?: string,"p_buyer_name": string,"p_buyer_phone"?: string,"p_campaign_id": string,"p_corrects_sale_id"?: string,"p_idempotency_key": string,"p_notes"?: string,"p_organization_id": string,"p_participant_id": string,"p_payment_method": string,"p_quantity": number,"p_sold_at"?: string }; Returns: Json
                           },
"record_external_drawing_result":
{ Args: { "p_drawn_at": string,"p_evidence_ref"?: string,"p_idempotency_key": string,"p_location": string,"p_method": string,"p_operator": string,"p_organization_id": string,"p_reason"?: string,"p_result": string,"p_snapshot_id": string,"p_winning_ticket_number": string,"p_witnesses": Json }; Returns: Json
                           },
"record_money_custody":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_request": Json }; Returns: Json
                           },
"reopen_drawing":
{ Args: { "p_idempotency_key": string,"p_organization_id": string,"p_reason": string,"p_snapshot_id": string }; Returns: Json
                           },
"reverse_campaign_sale":
{ Args: { "p_organization_id": string,"p_reason": string,"p_sale_id": string }; Returns: string
                           },
"revoke_invitation":
{ Args: { "p_invitation_id": string,"p_reason"?: string }; Returns: undefined
                           },
"roster_overview":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"save_import_validation":
{ Args: { "p_column_mapping"?: Json,"p_import_id": string,"p_mapping_id"?: string,"p_rows": Json,"p_summary": Json }; Returns: undefined
                           },
"seller_request_inbox":
{ Args: { "p_campaign_id": string,"p_organization_id": string,"p_view"?: string }; Returns: Json
                           },
"set_audit_reason":
{ Args: { "p_reason": string }; Returns: undefined
                           },
"set_campaign_participant_goal":
{ Args: { "p_goal_amount_cents"?: number,"p_organization_id": string,"p_participant_id": string }; Returns: undefined
                           },
"set_campaign_team_goal":
{ Args: { "p_campaign_id": string,"p_goal_amount_cents"?: number,"p_organization_id": string,"p_team_id": string }; Returns: undefined
                           },
"set_current_season":
{ Args: { "p_organization_id": string,"p_season_id": string }; Returns: undefined
                           },
"set_household_primary_contact":
{ Args: { "p_guardian_id": string,"p_organization_id": string }; Returns: undefined
                           },
"set_member_roles":
{ Args: { "p_member_id": string,"p_reason"?: string,"p_roles": (string)[] }; Returns: undefined
                           },
"set_member_status":
{ Args: { "p_member_id": string,"p_reason"?: string,"p_status": string }; Returns: undefined
                           },
"set_player_team":
{ Args: { "p_organization_id": string,"p_player_id": string,"p_team_id": string }; Returns: boolean
                           },
"set_primary_guardian":
{ Args: { "p_guardian_id": string,"p_organization_id": string,"p_player_id": string }; Returns: undefined
                           },
"set_team_staff_assignments":
{ Args: { "p_member_id": string,"p_reason"?: string,"p_team_ids": (string)[] }; Returns: number
                           },
"shares_org_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"submit_seller_interest_request":
{ Args: { "p_request": Json,"p_submission_key": string,"p_token": string }; Returns: Json
                           },
"team_player_counts":
{ Args: { "p_organization_id": string }; Returns: {
              "player_count": number,"team_id": string
            }[]
                           },
"transition_campaign":
{ Args: { "p_campaign_id": string,"p_reason"?: string,"p_to": string }; Returns: string
                           },
"unlink_family_guardian":
{ Args: { "p_link_id": string,"p_reason"?: string }; Returns: undefined
                           },
"update_seller_request_status":
{ Args: { "p_organization_id": string,"p_request_id": string,"p_sale_id"?: string,"p_status": string }; Returns: undefined
                           },
"verify_audit_chain":
{ Args: { "p_organization_id": string }; Returns: {
              "first_bad_pos": number,"head_hash": string,"ok": boolean,"rows_checked": number
            }[]
                           },
"verify_campaign_ledgers":
{ Args: { "p_campaign_id": string }; Returns: {
              "first_bad_pos": number,"head_hash": string,"ledger": string,"ok": boolean,"rows_checked": number
            }[]
                           },
"verify_drawing_snapshot":
{ Args: { "p_organization_id": string,"p_snapshot_id": string }; Returns: Json
                           },
"verify_hash_chain":
{ Args: { "p_partition": string,"p_partition_col": string,"p_table": string }; Returns: {
              "first_bad_pos": number,"head_hash": string,"ok": boolean,"rows_checked": number
            }[]
                           },
"withdraw_campaign_participant":
{ Args: { "p_organization_id": string,"p_participant_id": string,"p_reason": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

