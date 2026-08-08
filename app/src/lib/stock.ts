import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

const STOCK_ACCOUNT = "311"; // Marchandises
const VARIATION_STOCK_ACCOUNT = "603"; // Variations des stocks de biens achetés

export type StockValuation = {
  id: string;
  period_date: string;
  product_ref: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
};

export async function fetchStockValuations(): Promise<StockValuation[]> {
  const { data } = await supabase
    .from("stock_valuations")
    .select("id, period_date, product_ref, quantity, unit_cost, total_value")
    .eq("company_id", COMPANY_ID)
    .order("period_date", { ascending: false });
  return data ?? [];
}

export async function createStockValuation(params: {
  periodDate: string;
  productRef: string;
  quantity: number;
  unitCost: number;
}) {
  const { error } = await supabase.from("stock_valuations").insert({
    company_id: COMPANY_ID,
    period_date: params.periodDate,
    product_ref: params.productRef,
    quantity: params.quantity,
    unit_cost: params.unitCost,
    source: "manual",
  });
  if (error) throw new Error(error.message);
}

/** Les dates de valorisation distinctes, les plus récentes en premier. */
export function distinctPeriodDates(valuations: StockValuation[]): string[] {
  return [...new Set(valuations.map((v) => v.period_date))].sort((a, b) => (a < b ? 1 : -1));
}

/** Valeur totale du stock (tous produits confondus) à une date de valorisation donnée. */
export function stockValueAt(valuations: StockValuation[], periodDate: string): number {
  return valuations.filter((v) => v.period_date === periodDate).reduce((s, v) => s + v.total_value, 0);
}

export type StockVariationClosure = {
  id: string;
  period_date: string;
  opening_value: number;
  closing_value: number;
  variation: number;
  entry_id: string | null;
};

export async function fetchStockVariationClosures(): Promise<StockVariationClosure[]> {
  const { data } = await supabase
    .from("stock_variation_closures")
    .select("id, period_date, opening_value, closing_value, variation, entry_id")
    .eq("company_id", COMPANY_ID)
    .order("period_date", { ascending: false });
  return data ?? [];
}

/**
 * Génère l'écriture de variation de stock (méthode de l'inventaire
 * intermittent — voir docs/gaps-comptabilite.md, section 3, et
 * schema-extensions-5.sql) : compare la valeur de stock à deux dates de
 * valorisation et calcule automatiquement le coût des marchandises vendues
 * de la période, plutôt que de laisser l'utilisateur le calculer à la main.
 *
 * variation = closing - opening.
 * Stock en baisse (variation < 0, cas courant : plus vendu qu'acheté) → débit 603 / crédit 311.
 * Stock en hausse (variation > 0) → débit 311 / crédit 603.
 */
export async function generateStockVariationEntry(params: {
  openingDate: string;
  openingValue: number;
  closingDate: string;
  closingValue: number;
}): Promise<string> {
  const { openingDate, openingValue, closingDate, closingValue } = params;
  await assertPeriodOpen(closingDate);

  const { data: existing } = await supabase
    .from("stock_variation_closures")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("period_date", closingDate)
    .maybeSingle();
  if (existing) {
    throw new Error("Une écriture de variation de stock existe déjà pour cette date de clôture.");
  }

  const variation = Math.round((closingValue - openingValue) * 100) / 100;
  if (variation === 0) {
    throw new Error("Aucune variation de stock entre ces deux dates : rien à générer.");
  }

  const { data: journal, error: journalError } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", "OD")
    .single();
  if (journalError || !journal) throw new Error(journalError?.message ?? "Journal OD introuvable");

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journal.id,
      entry_date: closingDate,
      description: `Variation de stock (${openingDate} → ${closingDate})`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const amount = Math.abs(variation);
  const lines =
    variation < 0
      ? [
          { account_code: VARIATION_STOCK_ACCOUNT, debit: amount, credit: 0 },
          { account_code: STOCK_ACCOUNT, debit: 0, credit: amount },
        ]
      : [
          { account_code: STOCK_ACCOUNT, debit: amount, credit: 0 },
          { account_code: VARIATION_STOCK_ACCOUNT, debit: 0, credit: amount },
        ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error: closureError } = await supabase.from("stock_variation_closures").insert({
    company_id: COMPANY_ID,
    period_date: closingDate,
    opening_value: openingValue,
    closing_value: closingValue,
    variation,
    entry_id: entry.id,
  });
  if (closureError) throw new Error(closureError.message);

  return entry.id;
}
