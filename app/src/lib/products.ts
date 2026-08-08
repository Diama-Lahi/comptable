import { supabase, COMPANY_ID } from "@/lib/supabase";

export type Product = {
  id: string;
  code: string;
  label: string;
  unit_cost: number | null;
  active: boolean;
};

export async function fetchProducts(): Promise<Product[]> {
  const { data } = await supabase
    .from("products_services")
    .select("id, code, label, unit_cost, active")
    .eq("company_id", COMPANY_ID)
    .order("code");
  return data ?? [];
}

export async function createProduct(params: { code: string; label: string; unitCost: number }) {
  const { error } = await supabase
    .from("products_services")
    .insert({ company_id: COMPANY_ID, code: params.code, label: params.label, unit_cost: params.unitCost || null });
  if (error) throw new Error(error.message);
}

export type InvoiceOption = { id: string; invoice_number: string | null };

export async function fetchClientInvoices(): Promise<InvoiceOption[]> {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("company_id", COMPANY_ID)
    .eq("type", "client")
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Rattache une ligne de vente d'un produit à une facture (pour le calcul de marge). */
export async function recordProductSale(params: {
  invoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}) {
  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: params.invoiceId,
    product_id: params.productId,
    quantity: params.quantity,
    unit_price: params.unitPrice,
    amount_ht: Math.round(params.quantity * params.unitPrice * 100) / 100,
  });
  if (error) throw new Error(error.message);
}

export type ProductMargin = { productId: string; label: string; revenue: number; cost: number; margin: number };

export async function computeProductMargins(): Promise<ProductMargin[]> {
  const products = await fetchProducts();
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("product_id, quantity, unit_price")
    .not("product_id", "is", null);

  return products.map((p) => {
    const productLines = (lines ?? []).filter((l) => l.product_id === p.id);
    const revenue = productLines.reduce((s, l) => s + l.quantity * (l.unit_price ?? 0), 0);
    const cost = productLines.reduce((s, l) => s + l.quantity * (p.unit_cost ?? 0), 0);
    return { productId: p.id, label: `${p.code} — ${p.label}`, revenue, cost, margin: revenue - cost };
  });
}
