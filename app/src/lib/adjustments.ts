import { supabase, COMPANY_ID } from "@/lib/supabase";

const CHARGE_A_PAYER_COUNTERPART = "408"; // Fournisseurs — factures non parvenues
const PRODUIT_AVANCE_COUNTERPART = "487"; // Produits constatés d'avance
const PROVISION_CHARGE = "659"; // Dotations aux provisions pour dépréciation (clients)
const PROVISION_COMPTE = "491"; // Provisions pour dépréciation des comptes clients

export type AdjustmentType = "charge_a_payer" | "produit_constate_avance" | "provision_creance_douteuse";

export type Adjustment = {
  id: string;
  type: AdjustmentType;
  description: string | null;
  amount: number;
  status: "suggested" | "validated" | "rejected";
  related_invoice_id: string | null;
  created_at: string;
};

export async function fetchAdjustments(): Promise<Adjustment[]> {
  const { data } = await supabase
    .from("period_adjustments")
    .select("id, type, description, amount, status, related_invoice_id, created_at")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type OverdueInvoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ttc: number | null;
  third_parties: { name: string } | null;
};

/** Factures clients non soldées et échues depuis plus de `daysOverdue` jours, sans provision existante. */
export async function suggestDoubtfulInvoices(daysOverdue = 60): Promise<OverdueInvoice[]> {
  const threshold = new Date(Date.now() - daysOverdue * 86_400_000).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("period_adjustments")
    .select("related_invoice_id")
    .eq("type", "provision_creance_douteuse")
    .not("related_invoice_id", "is", null);
  const alreadyFlagged = new Set((existing ?? []).map((r) => r.related_invoice_id));

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, amount_ttc, third_parties(name)")
    .eq("company_id", COMPANY_ID)
    .eq("type", "client")
    .not("status", "in", "(paid,archived)")
    .lte("invoice_date", threshold);

  return ((invoices ?? []) as unknown as OverdueInvoice[]).filter((i) => !alreadyFlagged.has(i.id));
}

export async function createSuggestedProvision(invoice: OverdueInvoice) {
  const { error } = await supabase.from("period_adjustments").insert({
    company_id: COMPANY_ID,
    type: "provision_creance_douteuse",
    description: `Créance douteuse — ${invoice.third_parties?.name ?? "client"} (facture ${invoice.invoice_number ?? invoice.id})`,
    amount: invoice.amount_ttc ?? 0,
    related_invoice_id: invoice.id,
    status: "suggested",
  });
  if (error) throw new Error(error.message);
}

export async function createManualAdjustment(params: {
  type: "charge_a_payer" | "produit_constate_avance";
  accountCode: string;
  description: string;
  amount: number;
}) {
  const { error } = await supabase.from("period_adjustments").insert({
    company_id: COMPANY_ID,
    type: params.type,
    description: `[${params.accountCode}] ${params.description}`,
    amount: params.amount,
    status: "suggested",
  });
  if (error) throw new Error(error.message);
}

async function getJournalId(code: string): Promise<string> {
  const { data, error } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", code)
    .single();
  if (error || !data) throw new Error(error?.message ?? `Journal ${code} introuvable`);
  return data.id;
}

function extractAccountCode(description: string | null): string | null {
  const m = description?.match(/^\[(\w+)\]/);
  return m ? m[1] : null;
}

/** Valide une régularisation suggérée : génère l'écriture comptable (journal OD) et la lie. */
export async function validateAdjustment(adjustment: Adjustment) {
  const journalId = await getJournalId("OD");
  const entryDate = new Date().toISOString().slice(0, 10);

  let lines: { account_code: string; debit: number; credit: number }[];

  if (adjustment.type === "charge_a_payer") {
    const account = extractAccountCode(adjustment.description);
    if (!account) throw new Error("Compte de charge manquant pour cette régularisation");
    lines = [
      { account_code: account, debit: adjustment.amount, credit: 0 },
      { account_code: CHARGE_A_PAYER_COUNTERPART, debit: 0, credit: adjustment.amount },
    ];
  } else if (adjustment.type === "produit_constate_avance") {
    const account = extractAccountCode(adjustment.description);
    if (!account) throw new Error("Compte de produit manquant pour cette régularisation");
    lines = [
      { account_code: account, debit: adjustment.amount, credit: 0 },
      { account_code: PRODUIT_AVANCE_COUNTERPART, debit: 0, credit: adjustment.amount },
    ];
  } else {
    lines = [
      { account_code: PROVISION_CHARGE, debit: adjustment.amount, credit: 0 },
      { account_code: PROVISION_COMPTE, debit: 0, credit: adjustment.amount },
    ];
  }

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: entryDate,
      description: adjustment.description,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error: updateError } = await supabase
    .from("period_adjustments")
    .update({ status: "validated", entry_id: entry.id })
    .eq("id", adjustment.id);
  if (updateError) throw new Error(updateError.message);
}

export async function rejectAdjustment(id: string) {
  await supabase.from("period_adjustments").update({ status: "rejected" }).eq("id", id);
}
