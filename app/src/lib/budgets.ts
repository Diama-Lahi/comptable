import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// MODULE BUDGÉTAIRE — Création, suivi des écarts, alertes
// ============================================================================

export type Budget = {
  id: string;
  label: string;
  fiscal_year: number;
  type: "annual" | "rolling" | "project";
  status: "draft" | "active" | "closed";
};

export type BudgetLine = {
  id: string;
  budget_id: string;
  account_code: string;
  label: string;
  amount_budgeted: number;
  amount_actual: number;
  variance: number;
  variance_percent: number;
  period_month: number | null;
  notes: string | null;
};

/** CRUD Budgets */
export async function fetchBudgets(): Promise<Budget[]> {
  const { data } = await supabase
    .from("budgets")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("fiscal_year", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    fiscal_year: r.fiscal_year,
    type: r.type as Budget["type"],
    status: r.status as Budget["status"],
  }));
}

export async function createBudget(input: { label: string; fiscal_year: number; type?: Budget["type"] }): Promise<string> {
  const { data, error } = await supabase
    .from("budgets")
    .insert({ company_id: COMPANY_ID, label: input.label, fiscal_year: input.fiscal_year, type: input.type ?? "annual" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Échec création budget");
  return data.id;
}

export async function activateBudget(id: string) {
  const { error } = await supabase.from("budgets").update({ status: "active" }).eq("id", id).eq("company_id", COMPANY_ID);
  if (error) throw new Error(error.message);
}

/** Gestion des lignes budgétaires */
export async function fetchBudgetLines(budgetId: string): Promise<BudgetLine[]> {
  const { data } = await supabase.from("budget_lines").select("*").eq("budget_id", budgetId).order("account_code");
  return (data ?? []).map((r) => ({
    id: r.id,
    budget_id: r.budget_id,
    account_code: r.account_code,
    label: r.label,
    amount_budgeted: Number(r.amount_budgeted),
    amount_actual: Number(r.amount_actual),
    variance: Number(r.variance),
    variance_percent: Number(r.variance_percent),
    period_month: r.period_month,
    notes: r.notes,
  }));
}

export async function saveBudgetLine(input: {
  budget_id: string;
  account_code: string;
  label: string;
  amount_budgeted: number;
  period_month?: number;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("budget_lines")
    .insert({
      budget_id: input.budget_id,
      account_code: input.account_code,
      label: input.label,
      amount_budgeted: input.amount_budgeted,
      period_month: input.period_month ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Échec création ligne budget");
  return data.id;
}

/** Met à jour les réalisés à partir des écritures comptables */
export async function updateActuals(budgetId: string, from: string, to: string) {
  const lines = await fetchBudgetLines(budgetId);
  for (const line of lines) {
    const { data } = await supabase
      .from("entry_lines")
      .select("debit, credit")
      .eq("account_code", line.account_code)
      .gte("entry_date", from)
      .lte("entry_date", to);

    const totalDebit = (data ?? []).reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = (data ?? []).reduce((s, l) => s + Number(l.credit), 0);
    const actual = line.account_code.startsWith("6") ? totalDebit : totalCredit;

    await supabase.from("budget_lines").update({ amount_actual: actual }).eq("id", line.id);
  }
}

/** Récupère les alertes budgétaires (écarts > seuil) */
export async function fetchBudgetAlerts(budgetId: string, thresholdPercent = 10): Promise<BudgetLine[]> {
  const lines = await fetchBudgetLines(budgetId);
  return lines.filter((l) => Math.abs(l.variance_percent) > thresholdPercent && l.amount_budgeted > 0);
}