import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 1.4 — Contrôle de conformité BC / Facture
// ============================================================================

export type InvoiceControlResult = {
  control_id: string;
  invoice_id: string;
  purchase_order_id: string | null;
  po_number: string | null;
  invoice_number: string | null;
  invoice_amount: number;
  po_amount: number;
  amount_diff: number;
  qty_diff: boolean;
  price_diff: boolean;
  status: "pending" | "ok" | "warning" | "blocking";
  notes: string | null;
};

/** Compare une facture fournisseur avec le bon de commande associé */
export async function controlInvoiceWithPO(invoiceId: string): Promise<InvoiceControlResult> {
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .select("*, invoice_lines(*), purchase_order_id")
    .eq("id", invoiceId)
    .eq("company_id", COMPANY_ID)
    .single();

  if (invError || !invoice) throw new Error(invError?.message ?? "Facture introuvable");
  if (!invoice.purchase_order_id) {
    throw new Error("Aucun bon de commande associé à cette facture");
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("id", invoice.purchase_order_id)
    .single();

  if (!po) throw new Error("Bon de commande introuvable");

  // Comparaison des montants
  const invoiceTtc = Number(invoice.amount_ttc ?? 0);
  const poTtc = Number(po.total_ttc ?? 0);
  const amountDiff = invoiceTtc - poTtc;

  // Comparaison des quantités lignes
  const poLines = (po.purchase_order_lines ?? []) as Array<{ description: string; quantity: number; received_qty: number }>;
  const invLines = (invoice.invoice_lines ?? []) as Array<{ description: string; quantity: number }>;

  let hasQtyDiff = false;
  let hasPriceDiff = false;

  for (const poLine of poLines) {
    const matchingInvLine = invLines.find((il) =>
      il.description?.toLowerCase().includes(poLine.description?.toLowerCase().slice(0, 15) ?? "")
    );
    if (matchingInvLine) {
      if (matchingInvLine.quantity !== poLine.quantity) hasQtyDiff = true;
      // Note : la comparaison de prix nécessite les données brutes ligne par ligne
    }
  }

  // Détermination du statut
  let status: InvoiceControlResult["status"] = "ok";
  let notes: string | null = null;

  if (Math.abs(amountDiff) > 0.01) {
    status = Math.abs(amountDiff) / poTtc > 0.1 ? "blocking" : "warning";
    notes = `Écart de montant : ${amountDiff.toFixed(2)} FCFA`;
  }
  if (hasQtyDiff) {
    status = "blocking";
    notes = (notes ? notes + "; " : "") + "Différence de quantité constatée";
  }
  if (hasPriceDiff) {
    status = status === "blocking" ? "blocking" : "warning";
    notes = (notes ? notes + "; " : "") + "Différence de prix unitaire";
  }

  // Enregistre le contrôle
  const { data: control } = await supabase
    .from("invoice_controls")
    .insert({
      company_id: COMPANY_ID,
      invoice_id: invoiceId,
      purchase_order_id: invoice.purchase_order_id,
      amount_diff: amountDiff,
      qty_diff: hasQtyDiff,
      price_diff: hasPriceDiff,
      status,
      notes,
    })
    .select("id")
    .single();

  return {
    control_id: control?.id ?? "",
    invoice_id: invoiceId,
    purchase_order_id: invoice.purchase_order_id,
    po_number: po.po_number,
    invoice_number: invoice.invoice_number,
    invoice_amount: invoiceTtc,
    po_amount: poTtc,
    amount_diff: amountDiff,
    qty_diff: hasQtyDiff,
    price_diff: hasPriceDiff,
    status,
    notes,
  };
}

/** Récupère les contrôles effectués */
export async function fetchInvoiceControls(status?: string): Promise<InvoiceControlResult[]> {
  let query = supabase
    .from("invoice_controls")
    .select("*, invoices!inner(invoice_number, amount_ttc), purchase_orders!inner(po_number, total_ttc)")
    .eq("invoice_controls.company_id", COMPANY_ID)
    .order("control_date", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row: Record<string, unknown>) => {
    const inv = row.invoices as Record<string, unknown> || {};
    const po = row.purchase_orders as Record<string, unknown> || {};
    return {
      control_id: row.id as string,
      invoice_id: row.invoice_id as string,
      purchase_order_id: row.purchase_order_id as string | null,
      po_number: (po.po_number as string) ?? null,
      invoice_number: (inv.invoice_number as string) ?? null,
      invoice_amount: Number(inv.amount_ttc ?? 0),
      po_amount: Number(po.total_ttc ?? 0),
      amount_diff: Number(row.amount_diff ?? 0),
      qty_diff: Boolean(row.qty_diff),
      price_diff: Boolean(row.price_diff),
      status: row.status as InvoiceControlResult["status"],
      notes: row.notes as string | null,
    };
  });
}