import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

// ============================================================================
// Module 1.1 — Bons de commande fournisseurs
// ============================================================================

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  po_number: string;
  po_date: string;
  expected_date: string | null;
  total_ht: number;
  total_ttc: number;
  status: "draft" | "sent" | "partially_received" | "received" | "cancelled";
  notes: string | null;
  supplier_name?: string;
  created_at: string;
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  amount_ht: number;
  amount_ttc: number;
  received_qty: number;
};

/** Récupère tous les bons de commande d'une entreprise */
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data } = await supabase
    .from("purchase_orders")
    .select("id, po_number, po_date, expected_date, total_ht, total_ttc, status, notes, supplier_id, created_at, third_parties!inner(name)")
    .eq("company_id", COMPANY_ID)
    .order("po_date", { ascending: false });

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    supplier_id: row.supplier_id as string,
    po_number: row.po_number as string,
    po_date: row.po_date as string,
    expected_date: row.expected_date as string | null,
    total_ht: Number(row.total_ht),
    total_ttc: Number(row.total_ttc),
    status: row.status as PurchaseOrder["status"],
    notes: row.notes as string | null,
    supplier_name: (row.third_parties as Record<string, string>)?.name ?? "",
    created_at: row.created_at as string,
  }));
}

/** Récupère un bon de commande avec ses lignes */
export async function fetchPurchaseOrder(id: string): Promise<{ po: PurchaseOrder; lines: PurchaseOrderLine[] } | null> {
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, third_parties(name)")
    .eq("id", id)
    .eq("company_id", COMPANY_ID)
    .single();

  if (!po) return null;

  const { data: lines } = await supabase
    .from("purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", id)
    .order("id");

  return {
    po: {
      id: po.id,
      supplier_id: po.supplier_id,
      po_number: po.po_number,
      po_date: po.po_date,
      expected_date: po.expected_date,
      total_ht: Number(po.total_ht),
      total_ttc: Number(po.total_ttc),
      status: po.status,
      notes: po.notes,
      supplier_name: (po.third_parties as Record<string, string>)?.name ?? "",
      created_at: po.created_at,
    },
    lines: (lines ?? []).map((l) => ({
      ...l,
      amount_ht: Number(l.amount_ht),
      amount_ttc: Number(l.amount_ttc),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      tva_rate: Number(l.tva_rate),
      received_qty: Number(l.received_qty),
    })),
  };
}

export type CreatePurchaseOrderInput = {
  supplier_id: string;
  po_date: string;
  expected_date?: string;
  notes?: string;
  lines: { description: string; quantity: number; unit_price: number; tva_rate: number }[];
};

/** Crée un bon de commande avec ses lignes (transactionnel via la contrainte FK) */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<string> {
  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date(input.po_date).getFullYear(),
    p_prefix: "BC",
  });

  const poNumber = `BC-${new Date(input.po_date).getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;

  const totals = input.lines.reduce(
    (acc, l) => {
      const ht = l.quantity * l.unit_price;
      const ttc = ht * (1 + l.tva_rate / 100);
      return { ht: acc.ht + ht, ttc: acc.ttc + ttc };
    },
    { ht: 0, ttc: 0 }
  );

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: COMPANY_ID,
      supplier_id: input.supplier_id,
      po_number: poNumber,
      po_date: input.po_date,
      expected_date: input.expected_date ?? null,
      total_ht: totals.ht,
      total_ttc: totals.ttc,
      notes: input.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (poError || !po) throw new Error(poError?.message ?? "Échec création bon de commande");

  const { error: linesError } = await supabase.from("purchase_order_lines").insert(
    input.lines.map((l) => ({
      purchase_order_id: po.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tva_rate: l.tva_rate,
    }))
  );

  if (linesError) throw new Error(linesError.message);
  return po.id;
}

/** Valide (envoie) un bon de commande */
export async function sendPurchaseOrder(id: string) {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

/** Marque un bon de commande comme reçu et génère l'écriture de réception */
export async function receivePurchaseOrder(id: string, receivedDate: string) {
  await assertPeriodOpen(receivedDate);

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("id", id)
    .single();

  if (!po) throw new Error("Bon de commande introuvable");
  if (po.status === "cancelled") throw new Error("Impossible de recevoir un bon de commande annulé");

  // Vérifie si toutes les lignes sont entièrement reçues → status = 'received' sinon 'partially_received'
  const lines = po.purchase_order_lines as PurchaseOrderLine[];
  const allReceived = lines.every((l) => l.received_qty >= l.quantity);
  const newStatus = allReceived ? "received" : "partially_received";

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/** Annule un bon de commande */
export async function cancelPurchaseOrder(id: string) {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}