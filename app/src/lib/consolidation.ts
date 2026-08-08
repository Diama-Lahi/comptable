import { supabase, COMPANY_ID } from "@/lib/supabase";
import { generateBilan, generateCompteResultat } from "@/lib/financialStatements";

// ============================================================================
// MODULE DE CONSOLIDATION — Groupes, retraitements, éliminations internes
// ============================================================================

export type ConsolidationGroup = {
  id: string;
  parent_company_id: string;
  parent_name?: string;
  label: string;
  fiscal_year: number;
  consolidation_method: "full" | "equity" | "proportional";
};

export type ConsolidationMember = {
  id: string;
  group_id: string;
  company_id: string;
  company_name?: string;
  ownership_percentage: number;
  consolidation_method: "full" | "equity" | "proportional";
};

/** Récupère les groupes de consolidation */
export async function fetchGroups(): Promise<ConsolidationGroup[]> {
  const { data } = await supabase
    .from("consolidation_groups")
    .select("*, companies!inner(name)")
    .eq("parent_company_id", COMPANY_ID)
    .order("label");

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    parent_company_id: r.parent_company_id as string,
    parent_name: (r.companies as Record<string, unknown>)?.name as string ?? "",
    label: r.label as string,
    fiscal_year: r.fiscal_year as number,
    consolidation_method: r.consolidation_method as ConsolidationGroup["consolidation_method"],
  }));
}

/** Crée un groupe de consolidation */
export async function createGroup(input: { label: string; fiscal_year: number; consolidation_method?: string }): Promise<string> {
  const { data, error } = await supabase
    .from("consolidation_groups")
    .insert({
      parent_company_id: COMPANY_ID,
      label: input.label,
      fiscal_year: input.fiscal_year,
      consolidation_method: input.consolidation_method ?? "full",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec création groupe");
  return data.id;
}

/** Ajoute une société au groupe */
export async function addMember(input: { group_id: string; company_id: string; ownership_percentage: number; consolidation_method?: string }): Promise<string> {
  const { data, error } = await supabase
    .from("consolidation_members")
    .insert({
      group_id: input.group_id,
      company_id: input.company_id,
      ownership_percentage: input.ownership_percentage,
      consolidation_method: input.consolidation_method ?? "full",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Échec ajout membre");
  return data.id;
}

/** Récupère les membres d'un groupe */
export async function fetchMembers(groupId: string): Promise<ConsolidationMember[]> {
  const { data } = await supabase
    .from("consolidation_members")
    .select("*, companies!inner(name)")
    .eq("group_id", groupId);

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    group_id: r.group_id as string,
    company_id: r.company_id as string,
    company_name: (r.companies as Record<string, unknown>)?.name as string ?? "",
    ownership_percentage: Number(r.ownership_percentage),
    consolidation_method: r.consolidation_method as ConsolidationMember["consolidation_method"],
  }));
}

// ============================================================================
// EXÉCUTION DE LA CONSOLIDATION
// ============================================================================

export type ConsolidatedResult = {
  total_assets: number;
  total_liabilities: number;
  equity_group_share: number;
  equity_minority_share: number;
  revenue: number;
  net_income_group: number;
  net_income_minority: number;
  elimination_entries: { description: string; amount: number }[];
};

/**
 * Algorithme de consolidation complet
 * 1. Récupère les états individuels de chaque membre
 * 2. Agrège par méthode de consolidation
 * 3. Élimine les opérations internes
 * 4. Calcule la part du groupe et des minoritaires
 */
export async function runConsolidation(groupId: string, from: string, to: string): Promise<ConsolidatedResult> {
  const members = await fetchMembers(groupId);
  const eliminations: { description: string; amount: number }[] = [];

  // 1. Agrégation des états individuels
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalRevenue = 0;
  let totalNetIncome = 0;
  let minorityShare = 0;

  for (const member of members) {
    const [bilan, crc] = await Promise.all([
      generateBilan(from, to),
      generateCompteResultat(from, to),
    ]);

    const ownershipRatio = member.ownership_percentage / 100;

    switch (member.consolidation_method) {
      case "full": {
        // 100% des actifs/passifs, quote-part du résultat
        totalAssets += bilan.total_actif;
        totalLiabilities += bilan.total_passif;
        totalRevenue += crc.total_produits;
        totalNetIncome += crc.resultat_net * ownershipRatio;
        minorityShare += crc.resultat_net * (1 - ownershipRatio);
        break;
      }
      case "equity": {
        // Mise en équivalence : quote-part des capitaux propres
        const equityShare = (bilan.total_actif - bilan.total_passif) * ownershipRatio;
        totalAssets += equityShare;
        totalNetIncome += crc.resultat_net * ownershipRatio;
        break;
      }
      case "proportional": {
        // Quote-part proportionnelle
        totalAssets += bilan.total_actif * ownershipRatio;
        totalLiabilities += bilan.total_passif * ownershipRatio;
        totalRevenue += crc.total_produits * ownershipRatio;
        totalNetIncome += crc.resultat_net * ownershipRatio;
        break;
      }
    }
  }

  // 2. Éliminations des opérations internes
  // 2.1 Créances/dettes internes (comptes 401/411 entre sociétés du groupe)
  const memberIds = members.map((m) => m.company_id);
  const { data: internalInvoices } = await supabase
    .from("invoices")
    .select("amount_ttc, third_party_id")
    .in("company_id", memberIds)
    .gte("invoice_date", from)
    .lte("invoice_date", to);

  for (const inv of internalInvoices ?? []) {
    if (memberIds.includes(inv.third_party_id)) {
      const amount = Number(inv.amount_ttc);
      eliminations.push({ description: `Élimination opération interne (créance/dette)`, amount });
      totalAssets -= amount;
      totalLiabilities -= amount;
    }
  }

  // 2.2 Achats/ventes internes
  const { data: internalLines } = await supabase
    .from("entry_lines")
    .select("debit, credit, account_code")
    .in("account_code", ["601", "701"])
    .gte("entry_date", from)
    .lte("entry_date", to);

  for (const line of internalLines ?? []) {
    const amount = Number(line.debit) > 0 ? Number(line.debit) : Number(line.credit);
    eliminations.push({ description: `Élimination achat/vente interne (${line.account_code})`, amount });
    totalRevenue -= amount;
    totalNetIncome -= amount * 0.8;
  }

  // 3. Stockage du résultat consolidé
  const equityGroup = totalAssets - totalLiabilities - minorityShare;

  // Sauvegarde en base
  await supabase.from("consolidation_results").upsert({
    group_id: groupId,
    period_from: from,
    period_to: to,
    total_assets: Math.round(totalAssets * 100) / 100,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    equity_group_share: Math.round(equityGroup * 100) / 100,
    equity_minority_share: Math.round(minorityShare * 100) / 100,
    revenue: Math.round(totalRevenue * 100) / 100,
    net_income_group: Math.round(totalNetIncome * 100) / 100,
    net_income_minority: Math.round(minorityShare * 100) / 100,
    data: { eliminations },
    generated_at: new Date().toISOString(),
  });

  return {
    total_assets: Math.round(totalAssets * 100) / 100,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    equity_group_share: Math.round(equityGroup * 100) / 100,
    equity_minority_share: Math.round(minorityShare * 100) / 100,
    revenue: Math.round(totalRevenue * 100) / 100,
    net_income_group: Math.round(totalNetIncome * 100) / 100,
    net_income_minority: Math.round(minorityShare * 100) / 100,
    elimination_entries: eliminations,
  };
}