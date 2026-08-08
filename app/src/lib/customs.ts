import { supabase, COMPANY_ID } from "@/lib/supabase";

export type CustomsDeclaration = {
  id: string;
  related_invoice_id: string | null;
  declaration_date: string;
  customs_value: number;
  duties_paid: number;
  import_vat_paid: number;
  transit_fees: number;
  total_landed_cost: number;
  needs_review: boolean | null;
};

export async function fetchCustomsDeclarations(): Promise<CustomsDeclaration[]> {
  const { data } = await supabase
    .from("customs_declarations")
    .select(
      "id, related_invoice_id, declaration_date, customs_value, duties_paid, import_vat_paid, transit_fees, total_landed_cost, needs_review"
    )
    .eq("company_id", COMPANY_ID)
    .order("declaration_date", { ascending: false });
  return data ?? [];
}

// Tolérance au-delà de laquelle un écart entre la valeur déclarée et la
// facture d'achat d'origine part en revue plutôt que d'être accepté tel
// quel — voir docs/architecture-automatisation-maximale.md, ligne "Douane".
// Plus large que pour la paie : fret, assurance et conditions de change
// expliquent normalement une partie de l'écart.
const CUSTOMS_DEVIATION_TOLERANCE = 0.10;

/** Sans facture d'origine à comparer, rien ne permet de juger la cohérence : part en revue par défaut. */
export function customsNeedsReview(customsValue: number, invoiceAmountHt: number | null): boolean {
  if (invoiceAmountHt === null || invoiceAmountHt <= 0) return true;
  return Math.abs(customsValue - invoiceAmountHt) / invoiceAmountHt > CUSTOMS_DEVIATION_TOLERANCE;
}

export async function createCustomsDeclaration(params: {
  relatedInvoiceId: string | null;
  declarationDate: string;
  customsValue: number;
  dutiesPaid: number;
  importVatPaid: number;
  transitFees: number;
}) {
  let invoiceAmountHt: number | null = null;
  if (params.relatedInvoiceId) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("amount_ht")
      .eq("id", params.relatedInvoiceId)
      .single();
    invoiceAmountHt = invoice?.amount_ht ?? null;
  }
  const needsReview = customsNeedsReview(params.customsValue, invoiceAmountHt);

  const { error } = await supabase.from("customs_declarations").insert({
    company_id: COMPANY_ID,
    related_invoice_id: params.relatedInvoiceId,
    declaration_date: params.declarationDate,
    customs_value: params.customsValue,
    duties_paid: params.dutiesPaid,
    import_vat_paid: params.importVatPaid,
    transit_fees: params.transitFees,
    needs_review: needsReview,
  });
  if (error) throw new Error(error.message);
}
