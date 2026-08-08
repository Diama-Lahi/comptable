import { supabase, COMPANY_ID } from "@/lib/supabase";

export type UserRole = {
  id: string;
  user_identifier: string;
  role: "comptable" | "dirigeant" | "controleur" | "cabinet_externe" | "associe";
  can_view_sensitive: boolean;
  access_expires_at: string | null;
};

export async function fetchUserRoles(): Promise<UserRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("id, user_identifier, role, can_view_sensitive, access_expires_at")
    .eq("company_id", COMPANY_ID)
    .order("user_identifier");
  return data ?? [];
}

export async function createUserRole(params: {
  userIdentifier: string;
  role: UserRole["role"];
  canViewSensitive: boolean;
  accessExpiresAt: string;
}) {
  const { error } = await supabase.from("user_roles").insert({
    company_id: COMPANY_ID,
    user_identifier: params.userIdentifier,
    role: params.role,
    can_view_sensitive: params.canViewSensitive,
    access_expires_at: params.accessExpiresAt || null,
  });
  if (error) throw new Error(error.message);
}

export async function revokeUserRole(id: string) {
  const { error } = await supabase.from("user_roles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type DataProcessingEntry = {
  id: string;
  data_category: string;
  purpose: string;
  retention_years: number;
};

export async function fetchDataProcessingRegistry(): Promise<DataProcessingEntry[]> {
  const { data } = await supabase
    .from("data_processing_registry")
    .select("id, data_category, purpose, retention_years")
    .eq("company_id", COMPANY_ID)
    .order("data_category");
  return data ?? [];
}

export async function createDataProcessingEntry(params: {
  dataCategory: string;
  purpose: string;
  retentionYears: number;
}) {
  const { error } = await supabase.from("data_processing_registry").insert({
    company_id: COMPANY_ID,
    data_category: params.dataCategory,
    purpose: params.purpose,
    retention_years: params.retentionYears,
  });
  if (error) throw new Error(error.message);
}
