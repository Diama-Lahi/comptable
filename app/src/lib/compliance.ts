import { supabase, COMPANY_ID } from "@/lib/supabase";
import { generateBilan, generateCompteResultat } from "@/lib/financialStatements";

// ============================================================================
// MOTEUR DE VALIDATION NORMATIVE & SCORE DE CONFORMITÉ SYSCOHADA
// Analyse chaque écriture et calcule un score de conformité (0-100%)
// ============================================================================

export type ComplianceResult = {
  overall_score: number;
  categories: {
    accounting_quality: { score: number; max: number; items: ComplianceItem[] };
    tax_compliance: { score: number; max: number; items: ComplianceItem[] };
    financial_quality: { score: number; max: number; items: ComplianceItem[] };
    risk_penalties: { score: number; max: number; items: ComplianceItem[] };
  };
  risk_level: "elevated" | "medium" | "compliant" | "excellent";
  recommendations: string[];
};

export type ComplianceItem = {
  label: string;
  passed: boolean;
  points: number;
  max_points: number;
  detail?: string;
};

/** Calcule le score de conformité complet pour une période */
export async function computeComplianceScore(from: string, to: string): Promise<ComplianceResult> {
  const items: ComplianceItem[] = [];
  const recommendations: string[] = [];

  // ========================================================================
  // 1. QUALITÉ COMPTABLE (40 pts)
  // ========================================================================
  let accScore = 0;
  const accMax = 40;

  // 1.1 Écritures équilibrées (10 pts)
  const { data: entries } = await supabase
    .from("entries")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .gte("entry_date", from)
    .lte("entry_date", to);

  const { data: entryLines } = await supabase
    .from("entry_lines")
    .select("entry_id, debit, credit, account_code")
    .in("entry_id", (entries ?? []).map((e) => e.id));

  const entryMap = new Map<string, { debit: number; credit: number }[]>();
  for (const line of entryLines ?? []) {
    const arr = entryMap.get(line.entry_id) ?? [];
    arr.push({ debit: Number(line.debit), credit: Number(line.credit) });
    entryMap.set(line.entry_id, arr);
  }

  let balancedCount = 0;
  for (const [, lines] of entryMap) {
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) < 0.01) balancedCount++;
  }
  const balanceRatio = entries?.length ? balancedCount / entries.length : 0;
  const balancePts = Math.round(balanceRatio * 10);
  accScore += balancePts;
  items.push({ label: "Écritures équilibrées (débit = crédit)", passed: balanceRatio > 0.95, points: balancePts, max_points: 10 });
  if (balanceRatio < 0.95) recommendations.push(`${Math.round((1 - balanceRatio) * 100)}% des écritures ne sont pas équilibrées`);

  // 1.2 Comptes autorisés (10 pts)
  const accountCodes = [...new Set((entryLines ?? []).map((l) => l.entry_id))];
  const { data: validAccounts } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("company_id", COMPANY_ID);
  const validSet = new Set((validAccounts ?? []).map((a) => a.code));

  const allAccountCodes = [...new Set((entryLines ?? []).map((l) => l.account_code))];
  const invalidAccounts = allAccountCodes.filter((c) => !validSet.has(c));
  const accountValidRatio = allAccountCodes.length ? (allAccountCodes.length - invalidAccounts.length) / allAccountCodes.length : 1;
  const accountPts = Math.round(accountValidRatio * 10);
  accScore += accountPts;
  items.push({ label: "Comptes autorisés (existent dans le plan comptable)", passed: accountValidRatio > 0.98, points: accountPts, max_points: 10 });
  if (invalidAccounts.length > 0) recommendations.push(`${invalidAccounts.length} compte(s) inconnu(s) utilisés : ${invalidAccounts.slice(0, 5).join(", ")}`);

  // 1.3 TVA correcte (10 pts)
  const tvaLines = (entryLines ?? []).filter((l) => l.account_code.startsWith("4431") || l.account_code.startsWith("4452"));
  const tvaPts = tvaLines.length > 0 ? 10 : 5;
  accScore += tvaPts;
  items.push({ label: "TVA correctement comptabilisée", passed: tvaLines.length > 0, points: tvaPts, max_points: 10 });

  // 1.4 Tiers renseignés (5 pts)
  const { data: linesWithParties } = await supabase
    .from("entry_lines")
    .select("id")
    .in("entry_id", (entries ?? []).map((e) => e.id))
    .not("third_party_id", "is", null);
  const partyRatio = entries?.length ? (linesWithParties?.length ?? 0) / entries.length : 0;
  const partyPts = Math.round(partyRatio * 5);
  accScore += partyPts;
  items.push({ label: "Tiers renseignés sur les écritures", passed: partyRatio > 0.8, points: partyPts, max_points: 5 });

  // 1.5 Pièces justificatives (5 pts)
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .eq("company_id", COMPANY_ID);
  const docRatio = (invoices?.length ?? 0) > 0 ? Math.min((docs?.length ?? 0) / (invoices?.length ?? 1), 1) : 1;
  const docPts = Math.round(docRatio * 5);
  accScore += docPts;
  items.push({ label: "Pièces justificatives attachées", passed: docRatio > 0.7, points: docPts, max_points: 5 });
  if (docRatio < 0.7) recommendations.push("Ajoutez des pièces justificatives aux factures");

  // ========================================================================
  // 2. CONFORMITÉ FISCALE (30 pts)
  // ========================================================================
  let taxScore = 0;
  const taxMax = 30;

  // 2.1 TVA déclarée (10 pts)
  const { data: dsf } = await supabase
    .from("dsf_declarations")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .gte("declaration_date", from)
    .lte("declaration_date", to);
  const vatDeclared = (dsf?.length ?? 0) > 0;
  taxScore += vatDeclared ? 10 : 0;
  items.push({ label: "TVA déclarée sur la période", passed: vatDeclared, points: vatDeclared ? 10 : 0, max_points: 10 });
  if (!vatDeclared) recommendations.push("Aucune déclaration de TVA trouvée sur la période");

  // 2.2 IS calculé (10 pts)
  const resultat = await generateCompteResultat(from, to);
  const hasIncome = resultat.resultat_net > 0;
  taxScore += hasIncome ? 10 : 5;
  items.push({ label: "Impôt sur les Sociétés (IS) calculé", passed: hasIncome, points: hasIncome ? 10 : 5, max_points: 10 });

  // 2.3 Déclarations sociales (10 pts)
  const { data: payslips } = await supabase
    .from("payslips")
    .select("id")
    .eq("status", "validated");
  const socialDeclared = (payslips?.length ?? 0) > 0;
  taxScore += socialDeclared ? 10 : 0;
  items.push({ label: "Charges sociales déclarées (IPRES/CSS)", passed: socialDeclared, points: socialDeclared ? 10 : 0, max_points: 10 });
  if (!socialDeclared) recommendations.push("Aucune déclaration sociale trouvée");

  // ========================================================================
  // 3. QUALITÉ DES ÉTATS (20 pts)
  // ========================================================================
  let finScore = 0;
  const finMax = 20;

  // 3.1 Bilan équilibré (10 pts)
  try {
    const bilan = await generateBilan(from, to);
    const bilanBalanced = Math.abs(bilan.total_actif - bilan.total_passif) < 0.01;
    finScore += bilanBalanced ? 10 : 0;
    items.push({ label: "Bilan équilibré (actif = passif)", passed: bilanBalanced, points: bilanBalanced ? 10 : 0, max_points: 10 });
    if (!bilanBalanced) recommendations.push(`Le bilan n'est pas équilibré : actif ${bilan.total_actif} ≠ passif ${bilan.total_passif}`);
  } catch {
    finScore += 0;
    items.push({ label: "Bilan équilibré (actif = passif)", passed: false, points: 0, max_points: 10 });
  }

  // 3.2 CRC cohérent (5 pts)
  try {
    const crc = await generateCompteResultat(from, to);
    const crcOk = crc.produits.length > 0 && crc.charges.length > 0;
    finScore += crcOk ? 5 : 0;
    items.push({ label: "CRC cohérent (produits et charges)", passed: crcOk, points: crcOk ? 5 : 0, max_points: 5 });
  } catch {
    finScore += 0;
    items.push({ label: "CRC cohérent (produits et charges)", passed: false, points: 0, max_points: 5 });
  }

  // 3.3 Annexes complètes (5 pts)
  const { data: frozenAssets } = await supabase.from("fixed_assets").select("id").eq("company_id", COMPANY_ID);
  const hasAnnexes = (frozenAssets?.length ?? 0) > 0;
  finScore += hasAnnexes ? 5 : 2;
  items.push({ label: "Annexes (immobilisations, amortissements)", passed: hasAnnexes, points: hasAnnexes ? 5 : 2, max_points: 5 });

  // ========================================================================
  // 4. RISQUES (10 pts - pénalités)
  // ========================================================================
  let riskScore = 10;
  const riskMax = 10;

  // 4.1 Provisions insuffisantes
  const { data: litigations } = await supabase.from("litigations").select("id, amount_disputed, provision_amount").eq("company_id", COMPANY_ID);
  for (const lit of litigations ?? []) {
    if (Number(lit.amount_disputed) > 0 && Number(lit.provision_amount) < Number(lit.amount_disputed) * 0.5) {
      riskScore -= 3;
      recommendations.push(`Provision insuffisante pour le litige ${lit.id}`);
    }
  }

  // 4.2 Retards potentiels
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("type", "client")
    .lt("due_date", new Date().toISOString().slice(0, 10))
    .neq("status", "paid");
  if ((overdueInvoices?.length ?? 0) > 5) {
    riskScore -= 2;
    recommendations.push(`${overdueInvoices?.length} factures clients en retard de paiement`);
  }

  riskScore = Math.max(0, riskScore);
  items.push({ label: "Risques maîtrisés (provisions, retards)", passed: riskScore > 7, points: riskScore, max_points: 10 });

  // ========================================================================
  // CALCUL FINAL
  // ========================================================================
  const overall_score = accScore + taxScore + finScore + riskScore;
  const risk_level: ComplianceResult["risk_level"] =
    overall_score < 50 ? "elevated" :
    overall_score < 75 ? "medium" :
    overall_score < 90 ? "compliant" : "excellent";

  return {
    overall_score,
    categories: {
      accounting_quality: { score: accScore, max: accMax, items: items.filter((i) => i.max_points <= 10 && i.label.includes("écriture") || i.label.includes("Compte") || i.label.includes("TVA") || i.label.includes("Tiers") || i.label.includes("Pièce")) },
      tax_compliance: { score: taxScore, max: taxMax, items: items.filter((i) => i.label.includes("TVA") || i.label.includes("IS") || i.label.includes("sociale")) },
      financial_quality: { score: finScore, max: finMax, items: items.filter((i) => i.label.includes("Bilan") || i.label.includes("CRC") || i.label.includes("Annexe")) },
      risk_penalties: { score: riskScore, max: riskMax, items: items.filter((i) => i.label.includes("Risque")) },
    },
    risk_level,
    recommendations: [...new Set(recommendations)],
  };
}