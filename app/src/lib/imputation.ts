import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

const COLLECTIF_CLIENT = "411";
const COLLECTIF_FOURNISSEUR = "401";
const TVA_COLLECTEE = "4431";
const TVA_DEDUCTIBLE = "4452";

/** Compte le plus utilisé pour ce tiers, s'il en existe un. */
export async function suggestAccountCode(thirdPartyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("imputation_rules")
    .select("account_code")
    .eq("company_id", COMPANY_ID)
    .eq("third_party_id", thirdPartyId)
    .order("times_used", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.account_code ?? null;
}

/** Incrémente la règle existante pour ce tiers/compte, ou en crée une nouvelle. */
export async function recordImputation(thirdPartyId: string, accountCode: string) {
  const { data: existing } = await supabase
    .from("imputation_rules")
    .select("id, times_used")
    .eq("company_id", COMPANY_ID)
    .eq("third_party_id", thirdPartyId)
    .eq("account_code", accountCode)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("imputation_rules")
      .update({ times_used: existing.times_used + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("imputation_rules").insert({
      company_id: COMPANY_ID,
      third_party_id: thirdPartyId,
      account_code: accountCode,
      times_used: 1,
    });
  }
}

/** Nombre de fois où cette règle tiers → compte a déjà été utilisée sans correction. */
export async function getRuleTimesUsed(thirdPartyId: string, accountCode: string): Promise<number> {
  const { data } = await supabase
    .from("imputation_rules")
    .select("times_used")
    .eq("company_id", COMPANY_ID)
    .eq("third_party_id", thirdPartyId)
    .eq("account_code", accountCode)
    .maybeSingle();

  return data?.times_used ?? 0;
}

export type AutomationSettings = {
  confidenceThreshold: number;
  minRuleUsesForTrust: number;
  cashVoucherAutoLimit: number;
};

const AUTOMATION_DEFAULTS: AutomationSettings = {
  confidenceThreshold: 0.85,
  minRuleUsesForTrust: 3,
  cashVoucherAutoLimit: 50000,
};

/** Seuils de confiance de l'entreprise (moteur de confiance) — valeurs par défaut si non configurées. */
export async function getAutomationSettings(): Promise<AutomationSettings> {
  const { data } = await supabase
    .from("automation_settings")
    .select("confidence_threshold, min_rule_uses_for_trust, cash_voucher_auto_limit")
    .eq("company_id", COMPANY_ID)
    .maybeSingle();

  return {
    confidenceThreshold: data?.confidence_threshold ?? AUTOMATION_DEFAULTS.confidenceThreshold,
    minRuleUsesForTrust: data?.min_rule_uses_for_trust ?? AUTOMATION_DEFAULTS.minRuleUsesForTrust,
    cashVoucherAutoLimit: data?.cash_voucher_auto_limit ?? AUTOMATION_DEFAULTS.cashVoucherAutoLimit,
  };
}

/** Crée ou met à jour la ligne de réglages du moteur de confiance pour cette entreprise. */
export async function saveAutomationSettings(settings: AutomationSettings): Promise<void> {
  const { data: existing } = await supabase
    .from("automation_settings")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .maybeSingle();

  const patch = {
    confidence_threshold: settings.confidenceThreshold,
    min_rule_uses_for_trust: settings.minRuleUsesForTrust,
    cash_voucher_auto_limit: settings.cashVoucherAutoLimit,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("automation_settings").update(patch).eq("id", existing.id)
    : await supabase.from("automation_settings").insert({ company_id: COMPANY_ID, ...patch });

  if (error) throw new Error(error.message);
}

/**
 * Score de confiance d'une facture imputée automatiquement (0 à 1), selon
 * docs/architecture-automatisation-maximale.md : fournisseur/client déjà
 * connu + règle d'imputation stable + OCR exploitable = confiance haute.
 * La règle d'imputation stable pèse le plus lourd car c'est le facteur le
 * plus déterminant listé dans le document d'architecture.
 */
export function computeInvoiceConfidence(params: {
  isNewThirdParty: boolean;
  ruleTimesUsed: number;
  minRuleUsesForTrust: number;
  ocrText: string;
}): number {
  const thirdPartyScore = params.isNewThirdParty ? 0.3 : 1;
  const ruleScore = params.minRuleUsesForTrust > 0
    ? Math.min(params.ruleTimesUsed / params.minRuleUsesForTrust, 1)
    : 1;
  const ocrOk =
    params.ocrText.trim().length > 30 && !params.ocrText.startsWith("(OCR indisponible");
  const ocrScore = ocrOk ? 1 : 0.5;

  const score = thirdPartyScore * 0.25 + ruleScore * 0.5 + ocrScore * 0.25;
  return Math.round(score * 100) / 100;
}

type InvoiceForEntry = {
  type: "client" | "fournisseur";
  entryDate: string;
  reference: string | null;
  description: string | null;
  accountCode: string;
  amountHt: number;
  tvaAmount: number;
  amountTtc: number;
};

/** Génère l'écriture comptable équilibrée correspondant à une facture imputée, retourne l'id de l'écriture. */
export async function createEntryFromInvoice(invoice: InvoiceForEntry): Promise<string> {
  await assertPeriodOpen(invoice.entryDate);

  const journalCode = invoice.type === "fournisseur" ? "AC" : "VE";
  const { data: journal, error: journalError } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", journalCode)
    .single();

  if (journalError || !journal) {
    throw new Error(journalError?.message ?? `Journal ${journalCode} introuvable`);
  }

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journal.id,
      entry_date: invoice.entryDate,
      reference: invoice.reference,
      description: invoice.description,
      source: "invoice_ocr",
      status: "validated",
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    throw new Error(entryError?.message ?? "Échec de création de l'écriture");
  }

  const lines =
    invoice.type === "fournisseur"
      ? [
          { account_code: invoice.accountCode, debit: invoice.amountHt, credit: 0 },
          ...(invoice.tvaAmount > 0
            ? [{ account_code: TVA_DEDUCTIBLE, debit: invoice.tvaAmount, credit: 0 }]
            : []),
          { account_code: COLLECTIF_FOURNISSEUR, debit: 0, credit: invoice.amountTtc },
        ]
      : [
          { account_code: COLLECTIF_CLIENT, debit: invoice.amountTtc, credit: 0 },
          { account_code: invoice.accountCode, debit: 0, credit: invoice.amountHt },
          ...(invoice.tvaAmount > 0
            ? [{ account_code: TVA_COLLECTEE, debit: 0, credit: invoice.tvaAmount }]
            : []),
        ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));

  if (linesError) {
    throw new Error(linesError.message);
  }

  return entry.id;
}
