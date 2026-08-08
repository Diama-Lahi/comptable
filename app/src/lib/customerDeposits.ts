import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";
import { createEntryFromInvoice } from "@/lib/imputation";

// ============================================================================
// PHASE 2 — ACOMPTES CLIENTS AVEC TVA (Spécificité Sénégal)
// Gère le cycle complet : acompte → TVA exigible → facture finale → régularisation
// ============================================================================

const COMPTE_CLIENT = "411";
const COMPTE_TVA_COLLECTEE = "4431";
const COMPTE_PRODUIT = "701";

export type CustomerDeposit = {
  id: string;
  client_id: string;
  client_name?: string;
  deposit_number: string;
  deposit_date: string;
  amount_ht: number;
  tva_rate: number;
  tva_amount: number;
  amount_ttc: number;
  invoice_id: string | null;
  remaining_balance: number;
  status: "pending" | "partially_deducted" | "fully_deducted" | "refunded";
  created_at: string;
};

/** Récupère les acomptes clients */
export async function fetchDeposits(): Promise<CustomerDeposit[]> {
  const { data } = await supabase
    .from("customer_deposits")
    .select("*, third_parties!inner(name)")
    .eq("company_id", COMPANY_ID)
    .order("deposit_date", { ascending: false });

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    client_id: row.client_id as string,
    client_name: (row.third_parties as Record<string, string>)?.name ?? "",
    deposit_number: row.deposit_number as string,
    deposit_date: row.deposit_date as string,
    amount_ht: Number(row.amount_ht),
    tva_rate: Number(row.tva_rate),
    tva_amount: Number(row.tva_amount),
    amount_ttc: Number(row.amount_ttc),
    invoice_id: row.invoice_id as string | null,
    remaining_balance: Number(row.remaining_balance),
    status: row.status as CustomerDeposit["status"],
    created_at: row.created_at as string,
  }));
}

export type CreateDepositInput = {
  client_id: string;
  deposit_date: string;
  amount_ht: number;
  tva_rate?: number;
};

/**
 * Étape 1 : Créer un acompte client avec TVA exigible
 * Génère l'écriture : Débit 411 (client) / Crédit 701 (produit) + 4431 (TVA collectée)
 */
export async function createDeposit(input: CreateDepositInput): Promise<string> {
  await assertPeriodOpen(input.deposit_date);

  const tvaRate = input.tva_rate ?? 18;
  const tvaAmount = input.amount_ht * (tvaRate / 100);
  const amountTtc = input.amount_ht + tvaAmount;

  // Génère le numéro d'acompte
  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date(input.deposit_date).getFullYear(),
    p_prefix: "ACO",
  });
  const depositNumber = `ACO-${new Date(input.deposit_date).getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;

  // Écriture comptable : 411 (client) / 701 (produit) + 4431 (TVA)
  const { data: journal, error: journalError } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", "VE")
    .single();

  if (journalError || !journal) throw new Error("Journal VE introuvable");

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journal.id,
      entry_date: input.deposit_date,
      reference: depositNumber,
      description: `Acompte client ${depositNumber}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();

  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec création écriture");

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: COMPTE_CLIENT, debit: amountTtc, credit: 0, label: `Acompte ${depositNumber}` },
    { entry_id: entry.id, account_code: COMPTE_PRODUIT, debit: 0, credit: input.amount_ht, label: `Acompte HT ${depositNumber}` },
    { entry_id: entry.id, account_code: COMPTE_TVA_COLLECTEE, debit: 0, credit: tvaAmount, label: `TVA sur acompte ${depositNumber}` },
  ]);

  if (linesError) throw new Error(linesError.message);

  // Crée l'acompte
  const { data: deposit, error: depError } = await supabase
    .from("customer_deposits")
    .insert({
      company_id: COMPANY_ID,
      client_id: input.client_id,
      deposit_number: depositNumber,
      deposit_date: input.deposit_date,
      amount_ht: input.amount_ht,
      tva_rate: tvaRate,
      tva_amount: tvaAmount,
      amount_ttc: amountTtc,
      status: "pending",
      deposit_entry_id: entry.id,
    })
    .select("id")
    .single();

  if (depError || !deposit) throw new Error(depError?.message ?? "Échec création acompte");

  // Enregistre la TVA sur acompte
  await supabase.from("vat_on_deposits").insert({
    company_id: COMPANY_ID,
    deposit_id: deposit.id,
    vat_collected: tvaAmount,
    entry_id: entry.id,
  });

  return deposit.id;
}

/**
 * Étape 2 : Déduire un acompte sur une facture définitive
 * Régularise la TVA : la facture finale ne porte que sur le solde
 */
export async function deductDepositOnInvoice(depositId: string, invoiceId: string) {
  const { data: deposit } = await supabase
    .from("customer_deposits")
    .select("*")
    .eq("id", depositId)
    .eq("company_id", COMPANY_ID)
    .single();

  if (!deposit) throw new Error("Acompte introuvable");
  if (deposit.status === "fully_deducted") throw new Error("Cet acompte est déjà entièrement déduit");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_ttc, amount_ht, tva_amount, entry_id")
    .eq("id", invoiceId)
    .single();

  if (!invoice) throw new Error("Facture introuvable");

  // Montant déduit = min(acompte restant, facture)
  const remaining = Number(deposit.remaining_balance);
  const invoiceTtc = Number(invoice.amount_ttc);
  const amountDeducted = Math.min(remaining, invoiceTtc);
  const deductionRatio = amountDeducted / invoiceTtc;
  const tvaDeducted = Number(invoice.tva_amount) * deductionRatio;

  // Crée le lien acompte-facture
  const { error: linkError } = await supabase.from("invoice_deposit_links").insert({
    deposit_id: depositId,
    invoice_id: invoiceId,
    amount_deducted: Math.round(amountDeducted * 100) / 100,
    tva_deducted: Math.round(tvaDeducted * 100) / 100,
  });

  if (linkError) throw new Error(linkError.message);

  // Met à jour le statut de l'acompte
  const newRemaining = remaining - amountDeducted;
  const newStatus = newRemaining <= 0 ? "fully_deducted" : "partially_deducted";

  const { error: updateError } = await supabase
    .from("customer_deposits")
    .update({ status: newStatus, invoice_id: invoiceId })
    .eq("id", depositId);

  if (updateError) throw new Error(updateError.message);

  // Régularise la TVA
  await supabase.from("vat_on_deposits").update({
    vat_regularized: tvaDeducted,
  }).eq("deposit_id", depositId);

  return { amountDeducted, tvaDeducted, newStatus };
}

/** Solde des acomptes en cours */
export async function fetchOpenDepositsBalance(): Promise<{ count: number; total: number }> {
  const deposits = await fetchDeposits();
  const open = deposits.filter((d) => d.status !== "fully_deducted" && d.status !== "refunded");
  return {
    count: open.length,
    total: open.reduce((s, d) => s + d.remaining_balance, 0),
  };
}