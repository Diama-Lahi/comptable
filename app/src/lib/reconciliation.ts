import { supabase, COMPANY_ID } from "@/lib/supabase";

const BANK_ACCOUNT = "521";

export type CandidateLine = {
  entry_line_id: string;
  entry_date: string;
  description: string | null;
  amount: number;
};

export type Confidence = "certain" | "probable" | "a_verifier";

export type Match = { candidate: CandidateLine; confidence: Confidence } | null;

function daysBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** Lignes d'écriture sur le compte banque (521) qui ne sont pas encore rapprochées. */
export async function fetchUnreconciledBankLines(): Promise<CandidateLine[]> {
  const { data: reconciled } = await supabase.from("reconciliations").select("entry_line_id");
  const reconciledIds = new Set((reconciled ?? []).map((r) => r.entry_line_id));

  const { data: lines } = await supabase
    .from("entry_lines")
    .select("id, debit, credit, entries!inner(entry_date, description, company_id)")
    .eq("account_code", BANK_ACCOUNT)
    .eq("entries.company_id", COMPANY_ID);

  return ((lines ?? []) as unknown as Array<{
    id: string;
    debit: number;
    credit: number;
    entries: { entry_date: string; description: string | null };
  }>)
    .filter((l) => !reconciledIds.has(l.id))
    .map((l) => ({
      entry_line_id: l.id,
      entry_date: l.entries.entry_date,
      description: l.entries.description,
      amount: l.debit > 0 ? l.debit : -l.credit,
    }));
}

/** Meilleure correspondance pour une transaction bancaire donnée, parmi les lignes non rapprochées. */
export function findBestMatch(bankAmount: number, bankDate: string, candidates: CandidateLine[]): Match {
  const sameAmount = candidates.filter((c) => Math.abs(c.amount - bankAmount) < 0.01);
  if (sameAmount.length === 0) return null;

  sameAmount.sort((a, b) => daysBetween(a.entry_date, bankDate) - daysBetween(b.entry_date, bankDate));
  const best = sameAmount[0];
  const gap = daysBetween(best.entry_date, bankDate);

  const confidence: Confidence = gap === 0 ? "certain" : gap <= 3 ? "probable" : "a_verifier";
  return { candidate: best, confidence };
}

export async function confirmReconciliation(
  bankTransactionId: string,
  entryLineId: string,
  confidence: Confidence
) {
  const { error: reconError } = await supabase.from("reconciliations").insert({
    bank_transaction_id: bankTransactionId,
    entry_line_id: entryLineId,
    confidence,
  });
  if (reconError) throw new Error(reconError.message);

  const { error: txError } = await supabase
    .from("bank_transactions")
    .update({ reconciled: true })
    .eq("id", bankTransactionId);
  if (txError) throw new Error(txError.message);
}
