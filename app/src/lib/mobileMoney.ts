import { supabase, COMPANY_ID } from "@/lib/supabase";
import { calculateSimilarityScore, type MatchingCandidate, type MatchingResult } from "@/lib/algorithms";

// ============================================================================
// MODULE MOBILE MONEY — Wave Business, Orange Money Pro, Free Money
// Import, reconciliation, séparation automatique frais/principal
// ============================================================================

export type MobileMoneyConfig = {
  id: string;
  provider: "wave" | "orange_money" | "free_money";
  merchant_name: string;
  merchant_code: string | null;
  phone_number: string;
  active: boolean;
  last_sync_at: string | null;
};

export type MobileMoneyTransaction = {
  id: string;
  provider: "wave" | "orange_money" | "free_money";
  external_tx_id: string;
  type: "reception" | "paiement";
  sender_phone: string | null;
  sender_name: string | null;
  amount: number;
  provider_fees: number;
  net_amount: number;
  tx_date: string;
  reference: string | null;
  reconciled: boolean;
  invoice_id: string | null;
};

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

export async function fetchMobileMoneyConfigs(): Promise<MobileMoneyConfig[]> {
  const { data } = await supabase
    .from("mobile_money_config")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("provider");

  return (data ?? []).map((r) => ({
    id: r.id, provider: r.provider, merchant_name: r.merchant_name,
    merchant_code: r.merchant_code, phone_number: r.phone_number,
    active: r.active, last_sync_at: r.last_sync_at,
  }));
}

export async function saveMobileMoneyConfig(input: {
  provider: "wave" | "orange_money" | "free_money";
  merchant_name: string;
  merchant_code?: string;
  phone_number: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("mobile_money_config")
    .upsert({ company_id: COMPANY_ID, ...input, active: true }, { onConflict: "company_id,provider" })
    .select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Échec sauvegarde config");
  return data.id;
}

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------

export async function fetchMobileMoneyTransactions(params?: {
  provider?: string; reconciled?: boolean; from?: string; to?: string;
}): Promise<MobileMoneyTransaction[]> {
  let query = supabase
    .from("mobile_money_transactions")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("tx_date", { ascending: false })
    .limit(200);

  if (params?.provider) query = query.eq("provider", params.provider);
  if (params?.reconciled !== undefined) query = query.eq("reconciled", params.reconciled);
  if (params?.from) query = query.gte("tx_date", params.from);
  if (params?.to) query = query.lte("tx_date", params.to);

  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id, provider: r.provider, external_tx_id: r.external_tx_id,
    type: r.type, sender_phone: r.sender_phone, sender_name: r.sender_name,
    amount: Number(r.amount), provider_fees: Number(r.provider_fees), net_amount: Number(r.net_amount),
    tx_date: r.tx_date, reference: r.reference, reconciled: r.reconciled, invoice_id: r.invoice_id,
  }));
}

/** Importe une transaction Mobile Money depuis l'API externe */
export async function importMobileMoneyTransaction(tx: {
  provider: "wave" | "orange_money" | "free_money";
  external_tx_id: string; type: "reception" | "paiement";
  sender_phone: string; sender_name: string; amount: number;
  provider_fees: number; tx_date: string; reference?: string;
}): Promise<string> {
  // Vérifie si cette transaction existe déjà (dédoublonnage)
  const { data: existing } = await supabase
    .from("mobile_money_transactions")
    .select("id").eq("company_id", COMPANY_ID).eq("external_tx_id", tx.external_tx_id).maybeSingle();
  if (existing) return existing.id;

  // Récupère la config du provider
  const { data: config } = await supabase
    .from("mobile_money_config")
    .select("id").eq("company_id", COMPANY_ID).eq("provider", tx.provider).single();

  const { data, error } = await supabase
    .from("mobile_money_transactions")
    .insert({ company_id: COMPANY_ID, config_id: config?.id ?? null, ...tx })
    .select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Échec import transaction");
  return data.id;
}

// ---------------------------------------------------------------------------
// RAPPROCHEMENT MOBILE MONEY
// ---------------------------------------------------------------------------

/** Rapprocse automatiquement les transactions Mobile Money avec les factures clients impayées */
export async function reconcileMobileMoney(provider?: string) {
  const txs = await fetchMobileMoneyTransactions({ reconciled: false, provider });
  const results: { txId: string; match: MatchingResult | null }[] = [];

  for (const tx of txs) {
    if (tx.type !== "reception") continue;

    // Cherche les factures clients impayées
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, due_date, amount_ttc, third_party_id")
      .eq("company_id", COMPANY_ID).eq("type", "client")
      .neq("status", "paid")
      .order("due_date");

    if (!invoices || invoices.length === 0) continue;

    const candidates: MatchingCandidate[] = invoices.map((inv) => ({
      id: inv.id, amount: Number(inv.amount_ttc), date: inv.due_date || "",
      reference: inv.invoice_number || "", entityId: inv.third_party_id,
    }));

    const txCandidate: MatchingCandidate = {
      id: tx.id, amount: tx.amount, date: tx.tx_date,
      reference: tx.reference || tx.sender_name || "", entityId: tx.sender_phone,
    };

    let bestMatch: MatchingResult | null = null;
    for (const candidate of candidates) {
      const score = calculateSimilarityScore(txCandidate, candidate);
      if (!bestMatch || score.score > bestMatch.score) bestMatch = score;
    }

    if (bestMatch && bestMatch.confidence !== "ignore") {
      // Enregistre le rapprochement
      await supabase.from("mobile_money_transactions")
        .update({ reconciled: true, invoice_id: bestMatch.candidateId })
        .eq("id", tx.id);

      // Marque la facture comme payée
      await supabase.from("invoices").update({ status: "paid" }).eq("id", bestMatch.candidateId);
    }
    results.push({ txId: tx.id, match: bestMatch });
  }
  return results;
}

// ---------------------------------------------------------------------------
// FRAIS DE TRANSACTION
// ---------------------------------------------------------------------------

/** Calcule les frais applicables selon la règle configurée */
export async function calculateTransactionFees(method: string, amount: number): Promise<{ fee: number; accountCode: string }> {
  const { data: rule } = await supabase
    .from("transaction_fee_rules")
    .select("*")
    .eq("company_id", COMPANY_ID).eq("payment_method", method).eq("active", true).maybeSingle();

  if (!rule) return { fee: 0, accountCode: "631" };

  const fixed = Number(rule.fixed_fee);
  const pct = Number(rule.percentage_fee);
  const fee = fixed + amount * pct;

  return { fee: Math.round(fee * 100) / 100, accountCode: rule.fee_account_code };
}