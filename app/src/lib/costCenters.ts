import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchJournalLines } from "@/lib/ledger";

export type CostCenter = { id: string; code: string; label: string; active: boolean };

export async function fetchCostCenters(): Promise<CostCenter[]> {
  const { data } = await supabase
    .from("cost_centers")
    .select("id, code, label, active")
    .eq("company_id", COMPANY_ID)
    .order("code");
  return data ?? [];
}

export async function createCostCenter(code: string, label: string) {
  const { error } = await supabase.from("cost_centers").insert({ company_id: COMPANY_ID, code, label });
  if (error) throw new Error(error.message);
}

export type ProjectResult = { costCenterId: string; label: string; produits: number; charges: number; resultat: number };

/** Résultat (produits - charges) par centre de coût, sur une période. */
export async function computeResultByProject(from: string, to: string, costCenters: CostCenter[]): Promise<ProjectResult[]> {
  const lines = await fetchJournalLines({ from, to });

  return costCenters.map((cc) => {
    const ccLines = lines.filter((l) => l.cost_center_id === cc.id);
    const produits = ccLines.filter((l) => l.account_code.startsWith("7")).reduce((s, l) => s + l.credit - l.debit, 0);
    const charges = ccLines.filter((l) => l.account_code.startsWith("6")).reduce((s, l) => s + l.debit - l.credit, 0);
    return { costCenterId: cc.id, label: `${cc.code} — ${cc.label}`, produits, charges, resultat: produits - charges };
  });
}
