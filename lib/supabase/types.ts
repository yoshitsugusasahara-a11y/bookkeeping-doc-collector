export type UserRole = "customer" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

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
    };
    CompositeTypes: Record<string, never>;
  };
};
