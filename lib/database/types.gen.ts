
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
                    "action": string,"actor_id": string | null,"after_data": Json | null,"before_data": Json | null,"changed_fields": (string)[],"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string | null
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"changed_fields"?: (string)[],"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"changed_fields"?: (string)[],"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string | null
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
                },"campaigns": {
                  Row: {
                    "archived_at": string | null,"campaign_type": string,"created_at": string,"created_by": string | null,"draw_at": string | null,"id": string,"jurisdiction_mode": string | null,"name": string,"organization_id": string,"sales_close_at": string | null,"season_id": string | null,"settings": NonNullable<Json>,"starts_at": string | null,"status": string,"timezone": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"campaign_type"?: string,"created_at"?: string,"created_by"?: string | null,"draw_at"?: string | null,"id"?: string,"jurisdiction_mode"?: string | null,"name": string,"organization_id": string,"sales_close_at"?: string | null,"season_id"?: string | null,"settings"?: NonNullable<Json>,"starts_at"?: string | null,"status"?: string,"timezone"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"campaign_type"?: string,"created_at"?: string,"created_by"?: string | null,"draw_at"?: string | null,"id"?: string,"jurisdiction_mode"?: string | null,"name"?: string,"organization_id"?: string,"sales_close_at"?: string | null,"season_id"?: string | null,"settings"?: NonNullable<Json>,"starts_at"?: string | null,"status"?: string,"timezone"?: string | null,"updated_at"?: string,"updated_by"?: string | null
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
                },"organization_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"organization_id": string,"role_key": string,"role_scope": string,"status": string,"updated_at": string,"updated_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"role_key": string,"role_scope"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"role_key"?: string,"role_scope"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_role_key_role_scope_fkey"
      columns: ["role_key","role_scope"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["key","scope"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address_line1": string | null,"address_line2": string | null,"archived_at": string | null,"city": string | null,"country": string,"created_at": string,"created_by": string | null,"id": string,"jurisdiction_profile": string | null,"legal_name": string | null,"name": string,"organization_type": string,"postal_code": string | null,"region": string | null,"settings": NonNullable<Json>,"slug": string,"status": string,"support_email": string | null,"support_phone": string | null,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"jurisdiction_profile"?: string | null,"legal_name"?: string | null,"name": string,"organization_type"?: string,"postal_code"?: string | null,"region"?: string | null,"settings"?: NonNullable<Json>,"slug": string,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"jurisdiction_profile"?: string | null,"legal_name"?: string | null,"name"?: string,"organization_type"?: string,"postal_code"?: string | null,"region"?: string | null,"settings"?: NonNullable<Json>,"slug"?: string,"status"?: string,"support_email"?: string | null,"support_phone"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string
                  }
                  Insert: {
                    "category": string,"description"?: string,"key": string
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string
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
                }
          }
          Views: {
            "player_directory": {
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
            "add_players_to_household":
{ Args: { "p_household_id": string,"p_organization_id": string,"p_player_ids": (string)[] }; Returns: number
                           },
"archive_team":
{ Args: { "p_organization_id": string,"p_team_id": string }; Returns: number
                           },
"assert_org_permission":
{ Args: { "p_organization_id": string,"p_permission": string }; Returns: undefined
                           },
"bulk_set_player_team":
{ Args: { "p_organization_id": string,"p_player_ids": (string)[],"p_team_id": string }; Returns: number
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
"has_org_permission":
{ Args: { "p_organization_id": string,"p_permission": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_organization_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_org_permissions":
{ Args: { "p_organization_id": string }; Returns: (string)[]
                           },
"possible_duplicate_players":
{ Args: { "p_organization_id": string }; Returns: {
              "player_a_id": string,"player_b_id": string,"reason": string
            }[]
                           },
"roster_overview":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"save_import_validation":
{ Args: { "p_column_mapping"?: Json,"p_import_id": string,"p_mapping_id"?: string,"p_rows": Json,"p_summary": Json }; Returns: undefined
                           },
"set_current_season":
{ Args: { "p_organization_id": string,"p_season_id": string }; Returns: undefined
                           },
"set_household_primary_contact":
{ Args: { "p_guardian_id": string,"p_organization_id": string }; Returns: undefined
                           },
"set_player_team":
{ Args: { "p_organization_id": string,"p_player_id": string,"p_team_id": string }; Returns: boolean
                           },
"set_primary_guardian":
{ Args: { "p_guardian_id": string,"p_organization_id": string,"p_player_id": string }; Returns: undefined
                           },
"shares_org_with":
{ Args: { "p_user_id": string }; Returns: boolean
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

