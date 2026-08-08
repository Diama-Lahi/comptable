import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchJournalLines } from "@/lib/ledger";

const TVA_COLLECTEE = "4431";
const TVA_DEDUCTIBLE = "4452";
const TVA_DUE = "4441";

export type FiscalPeriod = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
  closed_at: string | null;
};

export async function fetchPeriods(): Promise<FiscalPeriod[]> {
  const { data } = await supabase
    .from("fiscal_periods")
    .select("id, label, start_date, end_date, status, closed_at")
    .eq("company_id", COMPANY_ID)
    .order("start_date", { ascending: false });
  return data ?? [];
}

export type TaxRegime = "reel_normal" | "reel_simplifie" | "cgu";

export async function fetchTaxRegime(): Promise<TaxRegime> {
  const { data } = await supabase.from("companies").select("tax_regime").eq("id", COMPANY_ID).single();
  return (data?.tax_regime as TaxRegime) ?? "reel_normal";
}

/**
 * Bloque toute écriture datée dans une période déjà clôturée — jusqu'ici
 * rien n'empêchait techniquement de saisir après coup dans un exercice
 * fermé. À appeler avant l'insertion de toute écriture (`entries`), qu'elle
 * vienne de la saisie manuelle ou d'une génération automatique
 * (factures, paie, bons de caisse...).
 */
export async function assertPeriodOpen(entryDate: string): Promise<void> {
  const { data } = await supabase
    .from("fiscal_periods")
    .select("label")
    .eq("company_id", COMPANY_ID)
    .eq("status", "closed")
    .lte("start_date", entryDate)
    .gte("end_date", entryDate)
    .maybeSingle();

  if (data) {
    throw new Error(`Période "${data.label}" déjà clôturée : impossible d'y saisir une écriture.`);
  }
}

export async function createPeriod(label: string, start: string, end: string) {
  const { error } = await supabase
    .from("fiscal_periods")
    .insert({ company_id: COMPANY_ID, label, start_date: start, end_date: end });
  if (error) throw new Error(error.message);
}

export type VatSummary = {
  collectee: number;
  deductible: number;
  net: number; // positif = TVA à payer, négatif = crédit de TVA
};

export async function computeVatSummary(period: FiscalPeriod): Promise<VatSummary> {
  const lines = await fetchJournalLines({ from: period.start_date, to: period.end_date });
  const collectee = lines.filter((l) => l.account_code === TVA_COLLECTEE).reduce((s, l) => s + l.credit - l.debit, 0);
  const deductible = lines.filter((l) => l.account_code === TVA_DEDUCTIBLE).reduce((s, l) => s + l.debit - l.credit, 0);
  return { collectee, deductible, net: collectee - deductible };
}

/** Clôture une période : génère l'écriture de solde de TVA (journal OD) puis marque la période fermée. */
export async function closePeriod(period: FiscalPeriod, vat: VatSummary) {
  if (vat.collectee > 0 || vat.deductible > 0) {
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
        entry_date: period.end_date,
        description: `Clôture TVA — ${period.label}`,
        source: "manual",
        status: "validated",
      })
      .select("id")
      .single();
    if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture de clôture");

    const lines = [
      ...(vat.collectee > 0 ? [{ account_code: TVA_COLLECTEE, debit: vat.collectee, credit: 0 }] : []),
      ...(vat.deductible > 0 ? [{ account_code: TVA_DEDUCTIBLE, debit: 0, credit: vat.deductible }] : []),
      ...(vat.net > 0 ? [{ account_code: TVA_DUE, debit: 0, credit: vat.net }] : []),
      ...(vat.net < 0 ? [{ account_code: TVA_DUE, debit: -vat.net, credit: 0 }] : []),
    ];

    const { error: linesError } = await supabase
      .from("entry_lines")
      .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
    if (linesError) throw new Error(linesError.message);
  }

  const { error } = await supabase
    .from("fiscal_periods")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", period.id);
  if (error) throw new Error(error.message);
}
