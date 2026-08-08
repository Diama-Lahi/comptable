import { supabase, COMPANY_ID } from "@/lib/supabase";

const DOTATION_ACCOUNT = "681"; // Dotations aux amortissements
const VALEUR_CESSION = "654"; // Valeurs comptables des cessions d'immobilisations
const PRODUIT_CESSION = "754"; // Produits des cessions d'immobilisations
const ENCAISSEMENT_CESSION = "571"; // Caisse — simplification : encaissement toujours en espèces

async function getOdJournalId(): Promise<string> {
  const { data, error } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", "OD")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Journal OD introuvable");
  return data.id;
}

export type FixedAsset = {
  id: string;
  label: string;
  category: string | null;
  acquisition_date: string;
  original_value: number;
  useful_life_months: number;
  asset_account_code: string;
  depreciation_account_code: string;
  disposal_date: string | null;
  disposal_value: number | null;
};

export async function fetchAssets(): Promise<FixedAsset[]> {
  const { data } = await supabase
    .from("fixed_assets")
    .select(
      "id, label, category, acquisition_date, original_value, useful_life_months, asset_account_code, depreciation_account_code, disposal_date, disposal_value"
    )
    .eq("company_id", COMPANY_ID)
    .order("acquisition_date", { ascending: false });
  return data ?? [];
}

export async function createAsset(params: {
  label: string;
  category: string;
  acquisitionDate: string;
  originalValue: number;
  usefulLifeMonths: number;
  assetAccountCode: string;
  depreciationAccountCode: string;
}) {
  const { error } = await supabase.from("fixed_assets").insert({
    company_id: COMPANY_ID,
    label: params.label,
    category: params.category || null,
    acquisition_date: params.acquisitionDate,
    original_value: params.originalValue,
    useful_life_months: params.usefulLifeMonths,
    asset_account_code: params.assetAccountCode,
    depreciation_account_code: params.depreciationAccountCode,
  });
  if (error) throw new Error(error.message);
}

export async function fetchCumulativeDepreciation(assetId: string): Promise<number> {
  const { data } = await supabase.from("depreciation_schedule").select("amount").eq("fixed_asset_id", assetId);
  return (data ?? []).reduce((s, r) => s + r.amount, 0);
}

export function monthlyDepreciationAmount(asset: FixedAsset): number {
  return Math.round((asset.original_value / asset.useful_life_months) * 100) / 100;
}

/** Génère (si pas déjà fait) la dotation aux amortissements du mois pour cet actif. */
export async function generateDepreciationEntry(asset: FixedAsset, periodDate: string): Promise<"created" | "exists"> {
  const { data: existing } = await supabase
    .from("depreciation_schedule")
    .select("id")
    .eq("fixed_asset_id", asset.id)
    .eq("period_date", periodDate)
    .maybeSingle();
  if (existing) return "exists";

  const amount = monthlyDepreciationAmount(asset);

  const journalId = await getOdJournalId();

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: periodDate,
      description: `Dotation amortissement — ${asset.label}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: DOTATION_ACCOUNT, debit: amount, credit: 0 },
    { entry_id: entry.id, account_code: asset.depreciation_account_code, debit: 0, credit: amount },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error: scheduleError } = await supabase
    .from("depreciation_schedule")
    .insert({ fixed_asset_id: asset.id, period_date: periodDate, amount, entry_id: entry.id });
  if (scheduleError) throw new Error(scheduleError.message);

  return "created";
}

/**
 * Enregistre la sortie d'une immobilisation et génère l'écriture de cession :
 * solde du compte d'amortissement et de l'actif, encaissement, et plus/moins-value (654/754).
 */
export async function recordDisposal(asset: FixedAsset, disposalDate: string, disposalValue: number) {
  const cumulative = await fetchCumulativeDepreciation(asset.id);
  const vnc = asset.original_value - cumulative;

  const journalId = await getOdJournalId();

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: disposalDate,
      description: `Cession immobilisation — ${asset.label}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture de cession");

  const lines = [
    { account_code: asset.depreciation_account_code, debit: cumulative, credit: 0 },
    { account_code: VALEUR_CESSION, debit: vnc, credit: 0 },
    { account_code: asset.asset_account_code, debit: 0, credit: asset.original_value },
    { account_code: ENCAISSEMENT_CESSION, debit: disposalValue, credit: 0 },
    { account_code: PRODUIT_CESSION, debit: 0, credit: disposalValue },
  ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase
    .from("fixed_assets")
    .update({ disposal_date: disposalDate, disposal_value: disposalValue })
    .eq("id", asset.id);
  if (error) throw new Error(error.message);
}
