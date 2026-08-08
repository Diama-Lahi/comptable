import { supabase, COMPANY_ID } from "@/lib/supabase";
import { computeFiscalImputation, type FiscalImputationParams } from "@/lib/algorithms";

// ============================================================================
// MODULE BRS — Bénéfice / Retenue à la Source
// Gère les déclarations mensuelles BRS et les attestations fournisseurs
// ============================================================================

export type BRSDeclaration = {
  id: string;
  period_month: string;
  declaration_date: string;
  total_prestations_locales: number;
  total_ret_5pct: number;
  total_prestations_non_resident: number;
  total_ret_20pct: number;
  total_regimes_derogatoires: number;
  total_ret_2pct: number;
  status: "draft" | "ready" | "submitted" | "acknowledged";
};

type BRSLine = {
  id: string;
  brs_id: string;
  supplier_id: string;
  supplier_name?: string;
  invoice_id: string | null;
  invoice_number: string | null;
  amount_ht: number;
  ret_rate: number;
  ret_amount: number;
  nature_prestation: string | null;
  attestation_generated: boolean;
};

/** Récupère les factures fournisseurs éligibles à la BRS (prestations locales, non-résident, dérogatoire) */
export async function fetchBRSEligibleInvoices(month: string) {
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, amount_ht, third_party_id, third_parties!inner(name, ninea)")
    .eq("company_id", COMPANY_ID)
    .eq("type", "fournisseur")
    .eq("status", "approved")
    .gte("invoice_date", month)
    .lt("invoice_date", new Date(new Date(month).getTime() + 32 * 86400000).toISOString().slice(0, 10));

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    invoice_number: r.invoice_number as string | null,
    invoice_date: r.invoice_date as string | null,
    amount_ht: Number(r.amount_ht),
    third_party_id: r.third_party_id as string,
    supplier_name: (r.third_parties as Record<string, unknown>)?.name as string ?? "",
    supplier_ninea: (r.third_parties as Record<string, unknown>)?.ninea as string ?? "",
  }));
}

/** Génère la déclaration BRS pour un mois donné */
export async function generateBRS(month: string): Promise<string> {
  // Récupère toutes les factures fournisseurs du mois
  const invoices = await fetchBRSEligibleInvoices(month);

  if (invoices.length === 0) throw new Error("Aucune facture éligible BRS pour ce mois");

  // Classification automatique des prestations
  const lines: {
    supplier_id: string; invoice_id: string; invoice_number: string | null;
    amount_ht: number; ret_rate: number; nature_prestation: string;
  }[] = [];

  for (const inv of invoices) {
    // Par défaut : prestation locale à 5%
    // TODO : logique d'identification automatique (si NINEA étranger → non-résident 20%, si régime dérogatoire → 2%)
    const isNonResident = !inv.supplier_ninea; // simplifié
    const nature = isNonResident ? "non_resident" : "prestation_locale";
    const rate = isNonResident ? 0.20 : 0.05;

    lines.push({
      supplier_id: inv.third_party_id,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      amount_ht: inv.amount_ht,
      ret_rate: rate,
      nature_prestation: nature,
    });
  }

  // Agrégation par catégorie
  const locales = lines.filter((l) => l.nature_prestation === "prestation_locale");
  const nonResidents = lines.filter((l) => l.nature_prestation === "non_resident");
  const derogatoires = lines.filter((l) => l.nature_prestation === "derogatoire");

  // Création de la déclaration
  const { data: brs, error } = await supabase
    .from("brs_declarations")
    .insert({
      company_id: COMPANY_ID,
      period_month: month,
      declaration_date: new Date().toISOString().slice(0, 10),
      total_prestations_locales: locales.reduce((s, l) => s + l.amount_ht, 0),
      total_ret_5pct: locales.reduce((s, l) => s + l.amount_ht * l.ret_rate, 0),
      total_prestations_non_resident: nonResidents.reduce((s, l) => s + l.amount_ht, 0),
      total_ret_20pct: nonResidents.reduce((s, l) => s + l.amount_ht * l.ret_rate, 0),
      total_regimes_derogatoires: derogatoires.reduce((s, l) => s + l.amount_ht, 0),
      total_ret_2pct: derogatoires.reduce((s, l) => s + l.amount_ht * l.ret_rate, 0),
      status: "ready",
    })
    .select("id")
    .single();

  if (error || !brs) throw new Error(error?.message ?? "Échec génération BRS");

  // Insertion des lignes
  const { error: linesError } = await supabase.from("brs_lines").insert(
    lines.map((l) => ({
      brs_id: brs.id,
      supplier_id: l.supplier_id,
      invoice_id: l.invoice_id,
      invoice_number: l.invoice_number,
      amount_ht: l.amount_ht,
      ret_rate: l.ret_rate,
      ret_amount: l.amount_ht * l.ret_rate,
      nature_prestation: l.nature_prestation,
    }))
  );

  if (linesError) throw new Error(linesError.message);

  return brs.id;
}

/** Récupère l'historique des déclarations BRS */
export async function fetchBRSHistory(): Promise<BRSDeclaration[]> {
  const { data } = await supabase
    .from("brs_declarations")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("period_month", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    period_month: r.period_month,
    declaration_date: r.declaration_date,
    total_prestations_locales: Number(r.total_prestations_locales),
    total_ret_5pct: Number(r.total_ret_5pct),
    total_prestations_non_resident: Number(r.total_prestations_non_resident),
    total_ret_20pct: Number(r.total_ret_20pct),
    total_regimes_derogatoires: Number(r.total_regimes_derogatoires),
    total_ret_2pct: Number(r.total_ret_2pct),
    status: r.status as BRSDeclaration["status"],
  }));
}