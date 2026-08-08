import { supabase, COMPANY_ID } from "@/lib/supabase";

const REIMBURSEMENT_ACCOUNT = "571"; // Caisse — simplification : remboursement toujours en espèces

export type ExpenseReport = {
  id: string;
  submitted_by: string;
  expense_date: string;
  motif: string | null;
  amount: number;
  receipt_url: string | null;
  status: "submitted" | "approved" | "reimbursed" | "rejected";
};

export async function fetchExpenseReports(): Promise<ExpenseReport[]> {
  const { data } = await supabase
    .from("expense_reports")
    .select("id, submitted_by, expense_date, motif, amount, receipt_url, status")
    .eq("company_id", COMPANY_ID)
    .order("expense_date", { ascending: false });
  return data ?? [];
}

export async function submitExpenseReport(params: {
  submittedBy: string;
  expenseDate: string;
  motif: string;
  amount: number;
  chargeAccountCode: string;
  receiptPath: string | null;
}) {
  const { error } = await supabase.from("expense_reports").insert({
    company_id: COMPANY_ID,
    submitted_by: params.submittedBy,
    expense_date: params.expenseDate,
    motif: `[${params.chargeAccountCode}] ${params.motif}`,
    amount: params.amount,
    receipt_url: params.receiptPath,
    status: "submitted",
  });
  if (error) throw new Error(error.message);
}

export async function approveExpenseReport(id: string) {
  await supabase.from("expense_reports").update({ status: "approved" }).eq("id", id);
}

export async function rejectExpenseReport(id: string) {
  await supabase.from("expense_reports").update({ status: "rejected" }).eq("id", id);
}

function extractAccountCode(motif: string | null): string | null {
  const m = motif?.match(/^\[(\w+)\]/);
  return m ? m[1] : null;
}

/** Marque une note de frais remboursée : génère l'écriture (journal CA, charge / caisse). */
export async function reimburseExpenseReport(report: ExpenseReport) {
  const account = extractAccountCode(report.motif);
  if (!account) throw new Error("Compte de charge manquant pour cette note de frais");

  const { data: journal, error: journalError } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", "CA")
    .single();
  if (journalError || !journal) throw new Error(journalError?.message ?? "Journal CA introuvable");

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journal.id,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `Remboursement note de frais — ${report.submitted_by}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: account, debit: report.amount, credit: 0 },
    { entry_id: entry.id, account_code: REIMBURSEMENT_ACCOUNT, debit: 0, credit: report.amount },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error: updateError } = await supabase
    .from("expense_reports")
    .update({ status: "reimbursed", entry_id: entry.id })
    .eq("id", report.id);
  if (updateError) throw new Error(updateError.message);
}

export type Advance = {
  id: string;
  amount_given: number;
  amount_settled: number;
  balance: number;
  given_date: string;
  status: "open" | "settled";
  third_parties: { name: string } | null;
};

export async function fetchAdvances(): Promise<Advance[]> {
  const { data } = await supabase
    .from("advances")
    .select("id, amount_given, amount_settled, balance, given_date, status, third_parties(name)")
    .eq("company_id", COMPANY_ID)
    .order("given_date", { ascending: false });
  return (data as unknown as Advance[]) ?? [];
}

export async function giveAdvance(params: { thirdPartyName: string; amount: number; givenDate: string }) {
  let thirdPartyId: string | null = null;
  const { data: existing } = await supabase
    .from("third_parties")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .ilike("name", params.thirdPartyName.trim())
    .maybeSingle();

  if (existing) {
    thirdPartyId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("third_parties")
      .insert({ company_id: COMPANY_ID, type: "les_deux", name: params.thirdPartyName.trim() })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Échec de création du tiers");
    thirdPartyId = created.id;
  }

  const { error } = await supabase.from("advances").insert({
    company_id: COMPANY_ID,
    third_party_id: thirdPartyId,
    amount_given: params.amount,
    given_date: params.givenDate,
  });
  if (error) throw new Error(error.message);
}

export async function settleAdvance(advance: Advance, amount: number) {
  const newSettled = advance.amount_settled + amount;
  const status = newSettled >= advance.amount_given ? "settled" : "open";
  const { error } = await supabase
    .from("advances")
    .update({ amount_settled: newSettled, status })
    .eq("id", advance.id);
  if (error) throw new Error(error.message);
}
