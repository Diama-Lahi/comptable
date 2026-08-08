import { supabase, COMPANY_ID } from "@/lib/supabase";

/** Numéro légal séquentiel, sans trou, par exercice (fonction SQL next_invoice_number). */
export async function nextLegalNumber(fiscalYear: number): Promise<string> {
  const { data, error } = await supabase.rpc("next_invoice_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: fiscalYear,
  });
  if (error) throw new Error(error.message);
  return `FAC-${fiscalYear}-${String(data).padStart(6, "0")}`;
}

export type CancellableInvoice = {
  id: string;
  invoice_number: string | null;
  legal_number: string | null;
  invoice_date: string | null;
  amount_ht: number | null;
  tva_rate: number | null;
  tva_amount: number | null;
  amount_ttc: number | null;
  third_party_id: string | null;
  is_cancelled: boolean;
};

/** Annule une facture client par avoir : crée une facture miroir en négatif et lie les deux. */
export async function cancelByAvoir(invoice: CancellableInvoice): Promise<string> {
  const year = new Date(invoice.invoice_date ?? Date.now()).getFullYear();
  const legalNumber = await nextLegalNumber(year);

  const { data: avoir, error } = await supabase
    .from("invoices")
    .insert({
      company_id: COMPANY_ID,
      type: "client",
      third_party_id: invoice.third_party_id,
      invoice_number: `AVOIR-${invoice.invoice_number ?? invoice.id}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount_ht: invoice.amount_ht ? -invoice.amount_ht : null,
      tva_rate: invoice.tva_rate,
      tva_amount: invoice.tva_amount ? -invoice.tva_amount : null,
      amount_ttc: invoice.amount_ttc ? -invoice.amount_ttc : null,
      status: "approved",
      legal_number: legalNumber,
      cancelled_by_invoice_id: invoice.id,
    })
    .select("id")
    .single();
  if (error || !avoir) throw new Error(error?.message ?? "Échec de création de l'avoir");

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ is_cancelled: true })
    .eq("id", invoice.id);
  if (updateError) throw new Error(updateError.message);

  return avoir.id;
}
