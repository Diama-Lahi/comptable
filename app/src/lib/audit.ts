import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// MOTEUR D'AUDIT & CONTRÔLE D'INVARIANTS BLOQUANTS
// Détection automatique des anomalies comptables obligatoires
// ============================================================================

export type AuditAnomaly = {
  type: "credit_balance" | "missing_audit" | "ledger_gap" | "inverse_solde" | "duplicate_invoice" | "missing_arf" | "period_lock_violation";
  severity: "critical" | "warning" | "info";
  description: string;
  entity_type: string;
  entity_id: string;
  recommendation: string;
  detected_at: string;
};

// ---------------------------------------------------------------------------
// 1. DÉTECTION SOLDE CRÉDITEUR DE CAISSE (Interdit légalement)
// ---------------------------------------------------------------------------

export async function detectCashCreditBalance(date?: string): Promise<AuditAnomaly[]> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const anomalies: AuditAnomaly[] = [];

  // Vérifie le solde du compte caisse (571) à date
  const { data: lines } = await supabase
    .from("entry_lines")
    .select("debit, credit, entries!inner(entry_date)")
    .eq("account_code", "571")
    .eq("entries.company_id", COMPANY_ID)
    .lte("entries.entry_date", targetDate);

  if (!lines) return anomalies;

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  const balance = totalDebit - totalCredit;

  if (balance < -0.01) {
    anomalies.push({
      type: "credit_balance",
      severity: "critical",
      description: `Solde créditeur de caisse détecté : ${balance.toFixed(2)} FCFA au ${targetDate}`,
      entity_type: "cash_account",
      entity_id: "571",
      recommendation: "Le solde de caisse ne doit jamais être créditeur. Vérifiez les écritures de caisse.",
      detected_at: new Date().toISOString(),
    });
  }

  // Enregistre l'anomalie en base
  if (anomalies.length > 0) {
    await supabase.from("cash_anomalies").insert({
      company_id: COMPANY_ID, anomaly_type: "credit_balance",
      description: `Solde créditeur caisse ${balance.toFixed(2)} FCFA`,
      detection_date: targetDate,
    });
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// 2. DÉTECTION TROUS DE NUMÉROTATION DANS LES JOURNAUX
// ---------------------------------------------------------------------------

export async function detectNumberingGaps(journalCode: string): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = [];

  // Récupère toutes les références d'écritures pour ce journal
  const { data: entries } = await supabase
    .from("entries")
    .select("reference")
    .eq("company_id", COMPANY_ID)
    .ilike("reference", `%${journalCode}%`)
    .order("reference")
    .limit(500);

  if (!entries || entries.length < 2) return anomalies;

  // Extrait les numéros et détecte les trous
  const numbers = entries
    .map((e) => {
      const match = e.reference?.match(/(\d{6,})$/);
      return match ? parseInt(match[1]) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] - numbers[i - 1] > 1) {
      anomalies.push({
        type: "ledger_gap",
        severity: "warning",
        description: `Trou de numérotation dans le journal ${journalCode} : entre ${numbers[i - 1]} et ${numbers[i]}`,
        entity_type: "journal",
        entity_id: journalCode,
        recommendation: `Vérifiez l'absence des écritures ${numbers[i - 1] + 1} à ${numbers[i] - 1}`,
        detected_at: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// 3. DÉTECTION COMPTES TIERS (CLASSE 4) À SOLDE INVERSE
// ---------------------------------------------------------------------------

export async function detectInverseTiersBalance(): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = [];

  // Récupère tous les comptes de classe 4
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("code, label, account_type")
    .eq("company_id", COMPANY_ID)
    .eq("class", 4)
    .limit(200);

  if (!accounts) return anomalies;

  for (const account of accounts) {
    const { data: lines } = await supabase
      .from("entry_lines")
      .select("debit, credit")
      .eq("account_code", account.code)
      .eq("entries.company_id", COMPANY_ID);

    if (!lines) continue;

    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

    // Compte actif (411, 4452...) : solde doit être débiteur
    if (account.account_type === "actif" && totalCredit > totalDebit && (totalCredit - totalDebit) > 100) {
      anomalies.push({
        type: "inverse_solde",
        severity: "warning",
        description: `Compte actif ${account.code} (${account.label}) en solde créditeur de ${(totalCredit - totalDebit).toFixed(2)} FCFA`,
        entity_type: "account",
        entity_id: account.code,
        recommendation: "Un compte d'actif en crédit est anormal. Vérifiez les imputations.",
        detected_at: new Date().toISOString(),
      });
    }

    // Compte passif (401, 431...) : solde doit être créditeur
    if (account.account_type === "passif" && totalDebit > totalCredit && (totalDebit - totalCredit) > 100) {
      anomalies.push({
        type: "inverse_solde",
        severity: "warning",
        description: `Compte passif ${account.code} (${account.label}) en solde débiteur de ${(totalDebit - totalCredit).toFixed(2)} FCFA`,
        entity_type: "account",
        entity_id: account.code,
        recommendation: "Un compte de passif en débit est anormal. Vérifiez les imputations.",
        detected_at: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// 4. DÉTECTION DOUBLONS DE FACTURES
// ---------------------------------------------------------------------------

export async function detectDuplicateInvoices(): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = [];

  // Cherche les factures avec même fournisseur, même montant, même date
  const { data: duplicates } = await supabase
    .from("invoices")
    .select("third_party_id, amount_ttc, invoice_date, count(*)")
    .eq("company_id", COMPANY_ID)
    .is("cancelled_by_invoice_id", null)
    .group_by("third_party_id, amount_ttc, invoice_date")
    .having("count(*)", "gt", 1);

  for (const dup of duplicates ?? []) {
    anomalies.push({
      type: "duplicate_invoice",
      severity: "warning",
      description: `Doublon potentiel : ${dup.count} factures chez ${dup.third_party_id} le ${dup.invoice_date} pour ${Number(dup.amount_ttc).toFixed(2)} FCFA`,
      entity_type: "invoice",
      entity_id: dup.third_party_id as string,
      recommendation: "Vérifiez s'il s'agit bien de factures distinctes ou d'un doublon de saisie.",
      detected_at: new Date().toISOString(),
    });
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// 5. DÉTECTION ABSENCE D'ARF (Attestation de Régularité Fiscale)
// ---------------------------------------------------------------------------

export async function detectExpiredARF(): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Tiers actifs sans ARF valide
  const { data: tiers } = await supabase
    .from("third_parties")
    .select("id, name, arf_valid_until")
    .eq("company_id", COMPANY_ID)
    .or(`arf_valid_until.is.null,arf_valid_until.lt.${today}`)
    .limit(50);

  for (const tier of tiers ?? []) {
    anomalies.push({
      type: "missing_arf",
      severity: "warning",
      description: `Tiers ${tier.name} sans ARF valide (${tier.arf_valid_until ?? "jamais renseignée"})`,
      entity_type: "third_party",
      entity_id: tier.id,
      recommendation: "Demandez l'Attestation de Régularité Fiscale à ce tiers avant de poursuivre les relations commerciales.",
      detected_at: new Date().toISOString(),
    });
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// 6. EXÉCUTION COMPLÈTE DU MOTEUR D'AUDIT
// ---------------------------------------------------------------------------

export async function runFullAudit(): Promise<AuditAnomaly[]> {
  const allAnomalies: AuditAnomaly[] = [];

  const results = await Promise.allSettled([
    detectCashCreditBalance(),
    detectNumberingGaps("AC"),
    detectNumberingGaps("VE"),
    detectNumberingGaps("BQ"),
    detectInverseTiersBalance(),
    detectDuplicateInvoices(),
    detectExpiredARF(),
  ]);

  for (const result of results) {
    if (result.status === "fulfilled") {
      allAnomalies.push(...result.value);
    }
  }

  // Enregistre dans la piste d'audit
  if (allAnomalies.length > 0) {
    await supabase.from("audit_logs").insert(
      allAnomalies.map((a) => ({
        company_id: COMPANY_ID,
        table_name: a.type,
        record_id: a.entity_id,
        operation: "INSERT",
        new_values: { description: a.description, severity: a.severity, recommendation: a.recommendation },
        performed_by: "system_audit",
      }))
    );
  }

  return allAnomalies;
}