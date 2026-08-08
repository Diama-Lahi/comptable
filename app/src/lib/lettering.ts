import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

const CLIENTS_ACCOUNT = "411";
const FOURNISSEURS_ACCOUNT = "401";
const PERTE_DE_CHANGE = "676";
const GAIN_DE_CHANGE = "776";

export type OutstandingInvoice = {
  id: string;
  type: "client" | "fournisseur";
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ttc: number;
  currency: string;
  exchange_rate: number;
  lettering_status: "non_lettree" | "partielle" | "soldee";
  third_parties: { name: string } | null;
  applied: number;
};

async function fetchAppliedByInvoice(invoiceIds: string[]): Promise<Map<string, number>> {
  if (invoiceIds.length === 0) return new Map();
  const { data } = await supabase
    .from("invoice_payment_links")
    .select("invoice_id, amount_applied")
    .in("invoice_id", invoiceIds);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.invoice_id, (map.get(row.invoice_id) ?? 0) + row.amount_applied);
  }
  return map;
}

export async function fetchOutstandingInvoices(type?: "client" | "fournisseur"): Promise<OutstandingInvoice[]> {
  let query = supabase
    .from("invoices")
    .select("id, type, invoice_number, invoice_date, amount_ttc, currency, exchange_rate, lettering_status, third_parties(name)")
    .eq("company_id", COMPANY_ID)
    .neq("lettering_status", "soldee")
    .not("status", "in", "(archived)");
  if (type) query = query.eq("type", type);

  const { data } = await query;
  const rows = (data as unknown as Omit<OutstandingInvoice, "applied">[]) ?? [];
  const appliedMap = await fetchAppliedByInvoice(rows.map((r) => r.id));

  return rows.map((r) => ({ ...r, applied: appliedMap.get(r.id) ?? 0 }));
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

/**
 * Enregistre un paiement appliqué à une facture : écriture comptable + lien de lettrage.
 *
 * Pour une facture en devise étrangère, `fxRateOnPayment` (taux du jour du règlement)
 * doit être fourni : le montant réellement mouvementé en trésorerie (`amount` converti
 * à ce taux) diffère alors du montant comptabilisé au taux de la facture d'origine —
 * l'écart est posté en écart de change (658 perte / 758 gain). Pour une facture en XOF,
 * `fxRateOnPayment` est ignoré (aucun écart possible).
 */
export async function recordPayment(params: {
  invoice: OutstandingInvoice;
  amount: number;
  paymentDate: string;
  method: "virement" | "wave" | "orange_money" | "especes" | "cheque";
  treasuryAccountCode: string;
  fxRateOnPayment?: number;
}) {
  const { invoice, amount, paymentDate, method, treasuryAccountCode } = params;
  await assertPeriodOpen(paymentDate);

  const isForeignCurrency = invoice.currency !== "XOF" && !!params.fxRateOnPayment;
  // amount = montant en devise d'origine si facture étrangère, sinon montant XOF direct.
  const amountBookedXof = isForeignCurrency ? amount * invoice.exchange_rate : amount;
  const amountActualXof = isForeignCurrency ? amount * params.fxRateOnPayment! : amount;
  const fxDifference = amountActualXof - amountBookedXof; // >0 si la devise s'est appréciée depuis la facture

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      company_id: COMPANY_ID,
      invoice_id: invoice.id,
      method,
      amount: amountActualXof,
      status: "executed",
      executed_date: paymentDate,
    })
    .select("id")
    .single();
  if (paymentError || !payment) throw new Error(paymentError?.message ?? "Échec de création du paiement");

  const journalCode = invoice.type === "client" ? "BQ" : "BQ";
  const journalId = await getJournalId(journalCode);
  const collectifAccount = invoice.type === "client" ? CLIENTS_ACCOUNT : FOURNISSEURS_ACCOUNT;

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: paymentDate,
      description: `Règlement facture ${invoice.invoice_number ?? invoice.id} — ${invoice.third_parties?.name ?? ""}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const lines =
    invoice.type === "client"
      ? [
          { account_code: treasuryAccountCode, debit: amountActualXof, credit: 0 },
          { account_code: collectifAccount, debit: 0, credit: amountBookedXof },
          ...(fxDifference > 0 ? [{ account_code: GAIN_DE_CHANGE, debit: 0, credit: fxDifference }] : []),
          ...(fxDifference < 0 ? [{ account_code: PERTE_DE_CHANGE, debit: -fxDifference, credit: 0 }] : []),
        ]
      : [
          { account_code: collectifAccount, debit: amountBookedXof, credit: 0 },
          { account_code: treasuryAccountCode, debit: 0, credit: amountActualXof },
          // Pour un fournisseur, une devise qui s'apprécie coûte plus cher à régler : perte.
          ...(fxDifference > 0 ? [{ account_code: PERTE_DE_CHANGE, debit: fxDifference, credit: 0 }] : []),
          ...(fxDifference < 0 ? [{ account_code: GAIN_DE_CHANGE, debit: 0, credit: -fxDifference }] : []),
        ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error: linkError } = await supabase
    .from("invoice_payment_links")
    .insert({ invoice_id: invoice.id, payment_id: payment.id, amount_applied: amountBookedXof });
  if (linkError) throw new Error(linkError.message);

  const totalApplied = invoice.applied + amountBookedXof;
  const newStatus = totalApplied >= invoice.amount_ttc - 0.01 ? "soldee" : totalApplied > 0 ? "partielle" : "non_lettree";
  const { error: updateError } = await supabase
    .from("invoices")
    .update({ lettering_status: newStatus })
    .eq("id", invoice.id);
  if (updateError) throw new Error(updateError.message);
}

export type AgedBucket = "0-30" | "30-60" | "60-90" | "90+";

export function computeAgedBalance(invoices: OutstandingInvoice[]): Record<AgedBucket, number> {
  const buckets: Record<AgedBucket, number> = { "0-30": 0, "30-60": 0, "60-90": 0, "90+": 0 };
  const now = Date.now();

  for (const inv of invoices) {
    if (!inv.invoice_date) continue;
    const days = Math.floor((now - new Date(inv.invoice_date).getTime()) / 86_400_000);
    const remaining = inv.amount_ttc - inv.applied;
    const bucket: AgedBucket = days <= 30 ? "0-30" : days <= 60 ? "30-60" : days <= 90 ? "60-90" : "90+";
    buckets[bucket] += remaining;
  }

  return buckets;
}
