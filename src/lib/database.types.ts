export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          phone: string | null;
          app_role: "user" | "broker" | "admin";
          intent: "buying" | "selling" | "both" | null;
          notification_prefs: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          phone?: string | null;
          app_role?: "user" | "broker" | "admin";
          intent?: "buying" | "selling" | "both" | null;
          notification_prefs?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          phone?: string | null;
          app_role?: "user" | "broker" | "admin";
          intent?: "buying" | "selling" | "both" | null;
          notification_prefs?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      auth_email_codes: {
        Row: {
          id: string;
          email: string;
          code_hash: string;
          purpose: "signin" | "signup";
          expires_at: string;
          consumed_at: string | null;
          attempt_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          code_hash: string;
          purpose: "signin" | "signup";
          expires_at: string;
          consumed_at?: string | null;
          attempt_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          code_hash?: string;
          purpose?: "signin" | "signup";
          expires_at?: string;
          consumed_at?: string | null;
          attempt_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          user_id: string;
          tier: number;
          id_status: string | null;
          funds_status: string | null;
          method: string | null;
          verified_at: string | null;
          persona_inquiry_id: string | null;
          preapproval_status: string | null;
          approved_amount_cents: number | null;
          lender_name: string | null;
          preapproval_confirmed_at: string | null;
        };
        Insert: {
          user_id: string;
          tier?: number;
          id_status?: string | null;
          funds_status?: string | null;
          method?: string | null;
          verified_at?: string | null;
          persona_inquiry_id?: string | null;
          preapproval_status?: string | null;
          approved_amount_cents?: number | null;
          lender_name?: string | null;
          preapproval_confirmed_at?: string | null;
        };
        Update: {
          user_id?: string;
          tier?: number;
          id_status?: string | null;
          funds_status?: string | null;
          method?: string | null;
          verified_at?: string | null;
          persona_inquiry_id?: string | null;
          preapproval_status?: string | null;
          approved_amount_cents?: number | null;
          lender_name?: string | null;
          preapproval_confirmed_at?: string | null;
        };
        Relationships: [];
      };
      lender_packets: {
        Row: {
          id: string;
          user_id: string;
          lender_id: string;
          lender_name: string;
          lender_email: string;
          payload: Json;
          pdf_storage_path: string | null;
          consent_version: string;
          delivery_status: "prepared" | "sent" | "failed";
          provider_id: string | null;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          lender_id: string;
          lender_name: string;
          lender_email: string;
          payload?: Json;
          pdf_storage_path?: string | null;
          consent_version: string;
          delivery_status?: "prepared" | "sent" | "failed";
          provider_id?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          lender_id?: string;
          lender_name?: string;
          lender_email?: string;
          payload?: Json;
          pdf_storage_path?: string | null;
          consent_version?: string;
          delivery_status?: "prepared" | "sent" | "failed";
          provider_id?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          bbl: string | null;
          address_line: string;
          city: string | null;
          state: string | null;
          zip: string | null;
          borough: string | null;
          block: string | null;
          lot: string | null;
          property_type: string | null;
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          year_built: number | null;
          lat: number | null;
          lng: number | null;
          acris_payload: Json | null;
          acris_fetched_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bbl?: string | null;
          address_line: string;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          borough?: string | null;
          block?: string | null;
          lot?: string | null;
          property_type?: string | null;
          beds?: number | null;
          baths?: number | null;
          sqft?: number | null;
          year_built?: number | null;
          lat?: number | null;
          lng?: number | null;
          acris_payload?: Json | null;
          acris_fetched_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          bbl?: string | null;
          address_line?: string;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          borough?: string | null;
          block?: string | null;
          lot?: string | null;
          property_type?: string | null;
          beds?: number | null;
          baths?: number | null;
          sqft?: number | null;
          year_built?: number | null;
          lat?: number | null;
          lng?: number | null;
          acris_payload?: Json | null;
          acris_fetched_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          property_id: string;
          seller_id: string;
          status: "draft" | "live" | "under_contract" | "closed" | "withdrawn";
          price_cents: number;
          description: string | null;
          media: Json;
          buyer_agent_offered: boolean;
          media_cost_cents: number;
          campaign_cost_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          seller_id: string;
          status: "draft" | "live" | "under_contract" | "closed" | "withdrawn";
          price_cents: number;
          description?: string | null;
          media?: Json;
          buyer_agent_offered?: boolean;
          media_cost_cents?: number;
          campaign_cost_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          seller_id?: string;
          status?: "draft" | "live" | "under_contract" | "closed" | "withdrawn";
          price_cents?: number;
          description?: string | null;
          media?: Json;
          buyer_agent_offered?: boolean;
          media_cost_cents?: number;
          campaign_cost_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deals: {
        Row: {
          id: string;
          listing_id: string;
          state:
            | "intake"
            | "prep"
            | "live"
            | "tours_offers"
            | "accepted"
            | "contract"
            | "in_contract"
            | "diligence"
            | "clear_to_close"
            | "closing"
            | "post_close"
            | "fell_through";
          fell_through_reason: string | null;
          contract_document_id: string | null;
          paused: boolean;
          paused_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          state:
            | "intake"
            | "prep"
            | "live"
            | "tours_offers"
            | "accepted"
            | "contract"
            | "in_contract"
            | "diligence"
            | "clear_to_close"
            | "closing"
            | "post_close"
            | "fell_through";
          fell_through_reason?: string | null;
          contract_document_id?: string | null;
          paused?: boolean;
          paused_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          state?:
            | "intake"
            | "prep"
            | "live"
            | "tours_offers"
            | "accepted"
            | "contract"
            | "in_contract"
            | "diligence"
            | "clear_to_close"
            | "closing"
            | "post_close"
            | "fell_through";
          fell_through_reason?: string | null;
          contract_document_id?: string | null;
          paused?: boolean;
          paused_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deal_parties: {
        Row: {
          deal_id: string;
          user_id: string;
          role:
            | "seller"
            | "co_seller"
            | "buyer"
            | "co_buyer"
            | "broker_of_record"
            | "agent_seller"
            | "agent_buyer"
            | "attorney_seller"
            | "attorney_buyer"
            | "lender"
            | "title"
            | "inspector"
            | "vendor";
          side: "seller" | "buyer" | "neutral";
        };
        Insert: {
          deal_id: string;
          user_id: string;
          role:
            | "seller"
            | "co_seller"
            | "buyer"
            | "co_buyer"
            | "broker_of_record"
            | "agent_seller"
            | "agent_buyer"
            | "attorney_seller"
            | "attorney_buyer"
            | "lender"
            | "title"
            | "inspector"
            | "vendor";
          side: "seller" | "buyer" | "neutral";
        };
        Update: {
          deal_id?: string;
          user_id?: string;
          role?:
            | "seller"
            | "co_seller"
            | "buyer"
            | "co_buyer"
            | "broker_of_record"
            | "agent_seller"
            | "agent_buyer"
            | "attorney_seller"
            | "attorney_buyer"
            | "lender"
            | "title"
            | "inspector"
            | "vendor";
          side?: "seller" | "buyer" | "neutral";
        };
        Relationships: [];
      };
      offers: {
        Row: {
          id: string;
          deal_id: string;
          buyer_id: string;
          status:
            | "new"
            | "under_review"
            | "accepted"
            | "declined"
            | "countered"
            | "expired"
            | "withdrawn";
          price_cents: number;
          financing: "cash" | "conventional" | "jumbo" | "other";
          down_pct: number;
          emd_cents: number;
          close_date: string | null;
          expires_at: string | null;
          contingencies: Json;
          verified_funds: boolean;
          certainty_label: string | null;
          ai_note: string | null;
          supersedes_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          buyer_id: string;
          status:
            | "new"
            | "under_review"
            | "accepted"
            | "declined"
            | "countered"
            | "expired"
            | "withdrawn";
          price_cents: number;
          financing: "cash" | "conventional" | "jumbo" | "other";
          down_pct: number;
          emd_cents: number;
          close_date?: string | null;
          expires_at?: string | null;
          contingencies?: Json;
          verified_funds?: boolean;
          certainty_label?: string | null;
          ai_note?: string | null;
          supersedes_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          buyer_id?: string;
          status?:
            | "new"
            | "under_review"
            | "accepted"
            | "declined"
            | "countered"
            | "expired"
            | "withdrawn";
          price_cents?: number;
          financing?: "cash" | "conventional" | "jumbo" | "other";
          down_pct?: number;
          emd_cents?: number;
          close_date?: string | null;
          expires_at?: string | null;
          contingencies?: Json;
          verified_funds?: boolean;
          certainty_label?: string | null;
          ai_note?: string | null;
          supersedes_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          deal_id: string;
          title: string;
          description: string | null;
          owner_user_id: string | null;
          owner_role: string | null;
          status: "pending" | "in_progress" | "waiting" | "done" | "skipped";
          due_date: string | null;
          auto: boolean;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          deal_id: string;
          title: string;
          description?: string | null;
          owner_user_id?: string | null;
          owner_role?: string | null;
          status: "pending" | "in_progress" | "waiting" | "done" | "skipped";
          due_date?: string | null;
          auto?: boolean;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          deal_id?: string;
          title?: string;
          description?: string | null;
          owner_user_id?: string | null;
          owner_role?: string | null;
          status?: "pending" | "in_progress" | "waiting" | "done" | "skipped";
          due_date?: string | null;
          auto?: boolean;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          id: string;
          deal_id: string;
          key: string;
          label: string;
          audience: "buyer" | "seller";
          position: number;
          status: "complete" | "in_progress" | "upcoming";
          completed_at: string | null;
          target_date: string | null;
          responsible_label: string | null;
          next_text: string | null;
        };
        Insert: {
          id?: string;
          deal_id: string;
          key: string;
          label: string;
          audience: "buyer" | "seller";
          position: number;
          status: "complete" | "in_progress" | "upcoming";
          completed_at?: string | null;
          target_date?: string | null;
          responsible_label?: string | null;
          next_text?: string | null;
        };
        Update: {
          id?: string;
          deal_id?: string;
          key?: string;
          label?: string;
          audience?: "buyer" | "seller";
          position?: number;
          status?: "complete" | "in_progress" | "upcoming";
          completed_at?: string | null;
          target_date?: string | null;
          responsible_label?: string | null;
          next_text?: string | null;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          deal_id: string | null;
          uploader_id: string | null;
          name: string;
          kind: string | null;
          storage_path: string | null;
          status: string | null;
          visibility: "shared" | "seller_side" | "buyer_side";
          extracted: Json | null;
          signature_request_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id?: string | null;
          uploader_id?: string | null;
          name: string;
          kind?: string | null;
          storage_path?: string | null;
          status?: string | null;
          visibility?: "shared" | "seller_side" | "buyer_side";
          extracted?: Json | null;
          signature_request_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string | null;
          uploader_id?: string | null;
          name?: string;
          kind?: string | null;
          storage_path?: string | null;
          status?: string | null;
          visibility?: "shared" | "seller_side" | "buyer_side";
          extracted?: Json | null;
          signature_request_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          deal_id: string;
          thread_key: string;
          sender_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          thread_key: string;
          sender_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          thread_key?: string;
          sender_id?: string | null;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      money_events: {
        Row: {
          id: string;
          deal_id: string;
          kind: string;
          amount_cents: number;
          status: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          kind: string;
          amount_cents: number;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          kind?: string;
          amount_cents?: number;
          status?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: number;
          deal_id: string | null;
          actor_id: string | null;
          type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          deal_id?: string | null;
          actor_id?: string | null;
          type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          deal_id: string;
          email: string;
          role: string;
          side: "seller" | "buyer" | "neutral";
          token_hash: string;
          expires_at: string;
          accepted_at: string | null;
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          email: string;
          role: string;
          side: "seller" | "buyer" | "neutral";
          token_hash: string;
          expires_at: string;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          email?: string;
          role?: string;
          side?: "seller" | "buyer" | "neutral";
          token_hash?: string;
          expires_at?: string;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          user_id: string | null;
          business_name: string;
          services: string[];
          service_area: string | null;
          stripe_connect_id: string | null;
          charges_enabled: boolean;
          active: boolean;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          business_name: string;
          services?: string[];
          service_area?: string | null;
          stripe_connect_id?: string | null;
          charges_enabled?: boolean;
          active?: boolean;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          business_name?: string;
          services?: string[];
          service_area?: string | null;
          stripe_connect_id?: string | null;
          charges_enabled?: boolean;
          active?: boolean;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          deal_id: string | null;
          channel: "email" | "sms" | "log";
          template_key: string;
          payload: Json;
          status: string;
          provider_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          deal_id?: string | null;
          channel: "email" | "sms" | "log";
          template_key: string;
          payload?: Json;
          status?: string;
          provider_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          deal_id?: string | null;
          channel?: "email" | "sms" | "log";
          template_key?: string;
          payload?: Json;
          status?: string;
          provider_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      service_jobs: {
        Row: {
          id: string;
          deal_id: string;
          vendor_id: string;
          buyer_or_seller_payer: string | null;
          service: string;
          price_cents: number;
          status: "requested" | "confirmed" | "paid" | "completed" | "cancelled";
          stripe_payment_intent: string | null;
          scheduled_at: string | null;
          deliverable_document_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          vendor_id: string;
          buyer_or_seller_payer?: string | null;
          service: string;
          price_cents: number;
          status: "requested" | "confirmed" | "paid" | "completed" | "cancelled";
          stripe_payment_intent?: string | null;
          scheduled_at?: string | null;
          deliverable_document_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          vendor_id?: string;
          buyer_or_seller_payer?: string | null;
          service?: string;
          price_cents?: number;
          status?: "requested" | "confirmed" | "paid" | "completed" | "cancelled";
          stripe_payment_intent?: string | null;
          scheduled_at?: string | null;
          deliverable_document_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          deal_id: string;
          kind:
            | "contract_execution"
            | "deposit_confirmation"
            | "designated_agency"
            | "listing_publish"
            | "verification_review"
            | "extraction_confirmation"
            | "listing_agreement_countersign";
          status: "pending" | "approved" | "rejected" | "changes_requested";
          context: Json;
          requested_by: string | null;
          decided_by: string | null;
          decided_at: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          kind:
            | "contract_execution"
            | "deposit_confirmation"
            | "designated_agency"
            | "listing_publish"
            | "verification_review"
            | "extraction_confirmation"
            | "listing_agreement_countersign";
          status?: "pending" | "approved" | "rejected" | "changes_requested";
          context?: Json;
          requested_by?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deal_id?: string;
          kind?:
            | "contract_execution"
            | "deposit_confirmation"
            | "designated_agency"
            | "listing_publish"
            | "verification_review"
            | "extraction_confirmation"
            | "listing_agreement_countersign";
          status?: "pending" | "approved" | "rejected" | "changes_requested";
          context?: Json;
          requested_by?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_homes: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      buying_power_profiles: {
        Row: {
          user_id: string;
          annual_income_cents: number;
          monthly_debts_cents: number;
          down_payment_cents: number;
          credit_band: "excellent" | "good" | "fair" | "building";
          rate_pct: number;
          term_years: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          annual_income_cents: number;
          monthly_debts_cents: number;
          down_payment_cents: number;
          credit_band: "excellent" | "good" | "fair" | "building";
          rate_pct: number;
          term_years: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          annual_income_cents?: number;
          monthly_debts_cents?: number;
          down_payment_cents?: number;
          credit_band?: "excellent" | "good" | "fair" | "building";
          rate_pct?: number;
          term_years?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      shares_deal: { Args: { p_deal_id: string }; Returns: boolean };
      is_seller_side: { Args: { p_deal_id: string }; Returns: boolean };
      is_buyer_side: { Args: { p_deal_id: string }; Returns: boolean };
      can_access_document: { Args: { p_deal_id: string; p_visibility: string }; Returns: boolean };
      document_visibility: { Args: { p_document_id: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
