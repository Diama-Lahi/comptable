import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 1.5 — Workflow de validation hiérarchique
// ============================================================================

export type EntityType =
  | "invoice_supplier"
  | "invoice_client"
  | "expense_report"
  | "payment"
  | "purchase_order";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type WorkflowRule = {
  id: string;
  entity_type: EntityType;
  min_amount: number;
  max_amount: number | null;
  approver_role: string;
  approval_order: number;
  active: boolean;
};

export type ApprovalRequest = {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  requested_by: string;
  approver_role: string;
  status: ApprovalStatus;
  comment: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
};

/** Récupère les règles de workflow pour un type d'entité */
export async function fetchWorkflowRules(entityType?: EntityType): Promise<WorkflowRule[]> {
  let query = supabase
    .from("workflow_rules")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true)
    .order("approval_order");

  if (entityType) query = query.eq("entity_type", entityType);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type as EntityType,
    min_amount: Number(r.min_amount),
    max_amount: r.max_amount ? Number(r.max_amount) : null,
    approver_role: r.approver_role,
    approval_order: r.approval_order,
    active: r.active,
  }));
}

/** Crée ou met à jour une règle de workflow */
export async function saveWorkflowRule(rule: {
  id?: string;
  entity_type: EntityType;
  min_amount: number;
  max_amount?: number;
  approver_role: string;
  approval_order: number;
}): Promise<string> {
  const payload = {
    company_id: COMPANY_ID,
    entity_type: rule.entity_type,
    min_amount: rule.min_amount,
    max_amount: rule.max_amount ?? null,
    approver_role: rule.approver_role,
    approval_order: rule.approval_order,
  };

  if (rule.id) {
    const { error } = await supabase.from("workflow_rules").update(payload).eq("id", rule.id);
    if (error) throw new Error(error.message);
    return rule.id;
  }

  const { data, error } = await supabase
    .from("workflow_rules")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec création règle");
  return data.id;
}

/** Détermine si une entité a besoin de validation, et par qui */
export async function determineApprovalNeeded(
  entityType: EntityType,
  amount: number
): Promise<{ needsApproval: boolean; approverRole?: string; rule?: WorkflowRule }> {
  const rules = await fetchWorkflowRules(entityType);

  for (const rule of rules) {
    if (amount >= rule.min_amount && (rule.max_amount === null || amount <= rule.max_amount)) {
      return { needsApproval: true, approverRole: rule.approver_role, rule };
    }
  }

  return { needsApproval: false };
}

/** Soumet une demande d'approbation */
export async function submitApprovalRequest(
  entityType: EntityType,
  entityId: string,
  requestedBy: string,
  approverRole: string
): Promise<string> {
  const { data, error } = await supabase
    .from("approval_requests")
    .insert({
      company_id: COMPANY_ID,
      entity_type: entityType,
      entity_id: entityId,
      requested_by: requestedBy,
      approver_role: approverRole,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec soumission approbation");
  return data.id;
}

/** Approuve ou rejette une demande */
export async function decideApproval(
  approvalId: string,
  status: "approved" | "rejected",
  decidedBy: string,
  comment?: string
) {
  const { error } = await supabase
    .from("approval_requests")
    .update({
      status,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      comment: comment ?? null,
    })
    .eq("id", approvalId)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

/** Récupère les approbations en attente pour un rôle */
export async function fetchPendingApprovals(approverRole: string): Promise<ApprovalRequest[]> {
  const { data } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("approver_role", approverRole)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type as EntityType,
    entity_id: r.entity_id,
    requested_by: r.requested_by,
    approver_role: r.approver_role,
    status: r.status as ApprovalStatus,
    comment: r.comment,
    decided_at: r.decided_at,
    decided_by: r.decided_by,
    created_at: r.created_at,
  }));
}

/** Récupère l'historique des approbations pour une entité */
export async function fetchApprovalHistory(
  entityType: EntityType,
  entityId: string
): Promise<ApprovalRequest[]> {
  const { data } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type as EntityType,
    entity_id: r.entity_id,
    requested_by: r.requested_by,
    approver_role: r.approver_role,
    status: r.status as ApprovalStatus,
    comment: r.comment,
    decided_at: r.decided_at,
    decided_by: r.decided_by,
    created_at: r.created_at,
  }));
}

/** Notifie les approbateurs (enregistre la notification en base — un service de queue enverra l'email) */
export async function notifyApprovers(entityType: EntityType, entityId: string, amount: number) {
  const { needsApproval, approverRole } = await determineApprovalNeeded(entityType, amount);
  if (!needsApproval || !approverRole) return null;

  return submitApprovalRequest(entityType, entityId, "system", approverRole);
}