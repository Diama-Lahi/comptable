import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Paramètres fiscaux dynamiques — plus aucun taux codé en dur
// ============================================================================

export type TaxSetting = {
  id: string;
  tax_code: string;
  tax_label: string;
  rate: number;
  base_type: "ht" | "ttc" | "brut" | "net";
  effective_from: string;
  effective_to: string | null;
  law_reference: string | null;
  version: number;
  active: boolean;
};

/** Récupère le taux applicable à une date donnée */
export async function getTaxRate(taxCode: string, date?: string): Promise<TaxSetting | null> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("tax_settings")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("tax_code", taxCode)
    .eq("active", true)
    .lte("effective_from", targetDate)
    .is("effective_to", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return mapTaxSetting(data);

  // Si un taux avec date de fin existe, vérifier s'il est encore valide
  const { data: withEnd } = await supabase
    .from("tax_settings")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("tax_code", taxCode)
    .eq("active", true)
    .lte("effective_from", targetDate)
    .gte("effective_to", targetDate)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return withEnd ? mapTaxSetting(withEnd) : null;
}

/** Récupère tous les taux pour un code fiscal (historique complet) */
export async function getTaxHistory(taxCode: string): Promise<TaxSetting[]> {
  const { data } = await supabase
    .from("tax_settings")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("tax_code", taxCode)
    .order("effective_from", { ascending: false });

  return (data ?? []).map(mapTaxSetting);
}

/** Crée ou met à jour un paramètre fiscal (nouvelle version) */
export async function setTaxRate(input: {
  tax_code: string;
  tax_label: string;
  rate: number;
  base_type?: "ht" | "ttc" | "brut" | "net";
  effective_from: string;
  law_reference?: string;
}): Promise<string> {
  // Clôture l'ancienne version
  await supabase
    .from("tax_settings")
    .update({ effective_to: input.effective_from, active: false })
    .eq("company_id", COMPANY_ID)
    .eq("tax_code", input.tax_code)
    .eq("active", true);

  // Compte le nombre de versions
  const { data: versions } = await supabase
    .from("tax_settings")
    .select("version")
    .eq("company_id", COMPANY_ID)
    .eq("tax_code", input.tax_code)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("tax_settings")
    .insert({
      company_id: COMPANY_ID,
      tax_code: input.tax_code,
      tax_label: input.tax_label,
      rate: input.rate,
      base_type: input.base_type ?? "ht",
      effective_from: input.effective_from,
      law_reference: input.law_reference ?? null,
      version: nextVersion,
      active: true,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec création tax setting");
  return data.id;
}

/** Calcule la TVA à partir du montant HT et du taux en vigueur */
export async function computeVat(amountHt: number, date?: string): Promise<{ rate: number; vatAmount: number; amountTtc: number }> {
  const tvaSetting = await getTaxRate("TVA", date);
  const rate = tvaSetting ? tvaSetting.rate / 100 : 0.18;
  const vatAmount = amountHt * rate;
  return {
    rate: rate * 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    amountTtc: amountHt + Math.round(vatAmount * 100) / 100,
  };
}

function mapTaxSetting(row: Record<string, unknown>): TaxSetting {
  return {
    id: row.id as string,
    tax_code: row.tax_code as string,
    tax_label: row.tax_label as string,
    rate: Number(row.rate),
    base_type: row.base_type as TaxSetting["base_type"],
    effective_from: row.effective_from as string,
    effective_to: row.effective_to as string | null,
    law_reference: row.law_reference as string | null,
    version: row.version as number,
    active: row.active as boolean,
  };
}