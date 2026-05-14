export type UserRole = "customer" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type OcrStatus = "pending" | "completed" | "failed" | "skipped";
export type MfSubmissionStatus = "not_ready" | "not_sent" | "sent" | "failed";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_accounts: {
        Row: {
          id: string;
          user_id: string;
          customer_name: string;
          client_slug: string;
          approval_status: ApprovalStatus;
          drive_folder_id: string | null;
          drive_folder_name: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          customer_name: string;
          client_slug: string;
          approval_status?: ApprovalStatus;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          customer_name?: string;
          client_slug?: string;
          approval_status?: ApprovalStatus;
          drive_folder_id?: string | null;
          drive_folder_name?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          customer_account_id: string;
          uploaded_by_user_id: string;
          transaction_note: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          drive_file_id: string | null;
          drive_view_url: string | null;
          thumbnail_url: string | null;
          ocr_status: OcrStatus;
          ocr_error: string | null;
          ocr_raw_response: unknown | null;
          ocr_processed_at: string | null;
          ocr_date: string | null;
          ocr_amount: number | null;
          ocr_store: string | null;
          ocr_summary: string | null;
          ocr_is_credit_card: boolean | null;
          mf_status: MfSubmissionStatus;
          mf_error: string | null;
          mf_journal_id: string | null;
          mf_voucher_file_id: string | null;
          mf_sent_at: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          customer_account_id: string;
          uploaded_by_user_id: string;
          transaction_note: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          drive_file_id?: string | null;
          drive_view_url?: string | null;
          thumbnail_url?: string | null;
          ocr_status?: OcrStatus;
          ocr_error?: string | null;
          ocr_raw_response?: unknown | null;
          ocr_processed_at?: string | null;
          ocr_date?: string | null;
          ocr_amount?: number | null;
          ocr_store?: string | null;
          ocr_summary?: string | null;
          ocr_is_credit_card?: boolean | null;
          mf_status?: MfSubmissionStatus;
          mf_error?: string | null;
          mf_journal_id?: string | null;
          mf_voucher_file_id?: string | null;
          mf_sent_at?: string | null;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          customer_account_id?: string;
          uploaded_by_user_id?: string;
          transaction_note?: string;
          file_name?: string;
          mime_type?: string;
          file_size?: number;
          drive_file_id?: string | null;
          drive_view_url?: string | null;
          thumbnail_url?: string | null;
          ocr_status?: OcrStatus;
          ocr_error?: string | null;
          ocr_raw_response?: unknown | null;
          ocr_processed_at?: string | null;
          ocr_date?: string | null;
          ocr_amount?: number | null;
          ocr_store?: string | null;
          ocr_summary?: string | null;
          ocr_is_credit_card?: boolean | null;
          mf_status?: MfSubmissionStatus;
          mf_error?: string | null;
          mf_journal_id?: string | null;
          mf_voucher_file_id?: string | null;
          mf_sent_at?: string | null;
          submitted_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      approval_status: ApprovalStatus;
      ocr_status: OcrStatus;
      mf_submission_status: MfSubmissionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
