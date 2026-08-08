import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// ALGORITHME DE MATCHING BANCAIRE — Rapprochement automatique
// Matching multi-critères : montant, date (tolérance +/-2j), référence
// ============================================================================

export type BankTransaction = {
  id: string;
  bank_date: string;
  label: string | null;
  amount: number;
  reference: string | null;
  reconciled: boolean;
  matched_entry_line_id: string | null;
  match_confidence: "auto_exact" | "auto_fuzzy" | "manual" | null;
};

export type EntryLineCandidate = {
  id: string;
  entry_id: string;
  account_code: string;
  debit: number;
  credit: number;
  entry_date: string;
  description: string | null;
  reference: string | null;
};

export type MatchResult = {
  bankTransactionId: string;
  entryLineId: string | null;
  score: number;           // 0 à 100
  confidence: "auto_exact" | "auto_fuzzy" | "manual";
  reasons: string[];       // pourquoi ce score
};

// ---------------------------------------------------------------------------
// PHASE 1 : Récupération des données
// ---------------------------------------------------------------------------

async function fetchUnmatchedBankTx(): Promise<BankTransaction[]> {
  const { data } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("reconciled", false)
    .order("bank_date", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    bank_date: r.bank_date,
    label: r.label,
    amount: Number(r.amount),
    reference: r.reference,
    reconciled: r.reconciled,
    matched_entry_line_id: r.matched_entry_line_id,
    match_confidence: r.match_confidence as BankTransaction["match_confidence"],
  }));
}

async function fetchUnmatchedEntryLines(): Promise<EntryLineCandidate[]> {
  const { data: matched } = await supabase
    .from("reconciliations")
    .select("entry_line_id");

  const matchedIds = new Set((matched ?? []).map((r) => r.entry_line_id));

  const { data: lines } = await supabase
    .from("entry_lines")
    .select("id, entry_id, account_code, debit, credit, entries!inner(entry_date, description, reference)")
    .eq("account_code", "521")  // compte banque
    .eq("entries.company_id", COMPANY_ID);

  return ((lines ?? []) as unknown as Array<{
    id: string;
    entry_id: string;
    account_code: string;
    debit: number;
    credit: number;
    entries: { entry_date: string; description: string | null; reference: string | null };
  }>)
    .filter((l) => !matchedIds.has(l.id))
    .map((l) => ({
      id: l.id,
      entry_id: l.entry_id,
      account_code: l.account_code,
      debit: Number(l.debit),
      credit: Number(l.credit),
      entry_date: l.entries.entry_date,
      description: l.entries.description,
      reference: l.entries.reference,
    }));
}

// ---------------------------------------------------------------------------
// PHASE 2 : Algorithme de scoring
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/**
 * Calcule un score de matching entre une transaction bancaire et une ligne d'écriture.
 * Score sur 100 : 
 *  - Montant exact : 40 pts (ou 20 si différence < 1)
 *  - Date identique : 30 pts (ou 15 si +/-1 jour, 5 si +/-2 jours)
 *  - Référence identique : 30 pts
 *  - Référence partielle : 15 pts
 */
export function computeMatchScore(bankTx: BankTransaction, entryLine: EntryLineCandidate): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. Comparaison des montants (40 pts max)
  const entryAmount = entryLine.debit > 0 ? entryLine.debit : -entryLine.credit;
  const amountDiff = Math.abs(Math.abs(bankTx.amount) - Math.abs(entryAmount));

  if (amountDiff < 0.01) {
    score += 40;
    reasons.push("Montant exact");
  } else if (amountDiff < 1) {
    score += 30;
    reasons.push(`Montant proche (diff: ${amountDiff.toFixed(2)})`);
  } else if (amountDiff < 10) {
    score += 15;
    reasons.push(`Montant approximatif (diff: ${amountDiff.toFixed(2)})`);
  }

  // 2. Comparaison des dates (30 pts max)
  const gap = daysBetween(bankTx.bank_date, entryLine.entry_date);

  if (gap === 0) {
    score += 30;
    reasons.push("Date identique");
  } else if (gap <= 1) {
    score += 20;
    reasons.push("Date à J+/-1");
  } else if (gap <= 2) {
    score += 10;
    reasons.push("Date à J+/-2");
  }

  // 3. Comparaison des références (30 pts max)
  const bankRef = bankTx.reference ?? "";
  const entryRef = entryLine.reference ?? "";

  if (bankRef && entryRef && bankRef === entryRef) {
    score += 30;
    reasons.push("Référence identique");
  } else if (bankRef && entryRef) {
    // Référence partielle (les 6 derniers caractères identiques)
    const bankShort = bankRef.slice(-6);
    const entryShort = entryRef.slice(-6);
    if (bankShort === entryShort) {
      score += 15;
      reasons.push("Fin de référence identique");
    } else if (bankRef.includes(entryRef) || entryRef.includes(bankRef)) {
      score += 10;
      reasons.push("Référence partiellement incluse");
    }
  }

  // 4. Description matching (bonus)
  const bankLabel = bankTx.label ?? "";
  const entryDesc = entryLine.description ?? "";
  if (bankLabel && entryDesc) {
    const bankWords = bankLabel.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const matchCount = bankWords.filter((w) => entryDesc.toLowerCase().includes(w)).length;
    if (matchCount > 0) {
      const bonus = Math.min(matchCount * 5, 10);
      score += bonus;
      reasons.push(`+${bonus} mots-clés description`);
    }
  }

  // Déduction de confiance
  const confidence: "auto_exact" | "auto_fuzzy" | "manual" =
    score >= 90 ? "auto_exact" :
    score >= 60 ? "auto_fuzzy" : "manual";

  return {
    bankTransactionId: bankTx.id,
    entryLineId: entryLine.id,
    score: Math.min(score, 100),
    confidence,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// PHASE 3 : Exécution du matching automatique
// ---------------------------------------------------------------------------

/**
 * Lance le matching pour toutes les transactions bancaires non rapprochées.
 * Retourne les meilleurs matchs trouvés.
 */
export async function runAutoMatching(): Promise<{
  autoExact: MatchResult[];
  autoFuzzy: MatchResult[];
  unmatched: BankTransaction[];
}> {
  const bankTxs = await fetchUnmatchedBankTx();
  const entryLines = await fetchUnmatchedEntryLines();

  const autoExact: MatchResult[] = [];
  const autoFuzzy: MatchResult[] = [];
  const matchedEntryIds = new Set<string>();

  for (const bankTx of bankTxs) {
    // Calcule le score pour chaque ligne d'écriture
    const scores: MatchResult[] = entryLines
      .filter((el) => !matchedEntryIds.has(el.id))
      .map((el) => computeMatchScore(bankTx, el))
      .sort((a, b) => b.score - a.score);

    if (scores.length === 0) continue;

    const best = scores[0];

    // Seuils de matching
    if (best.score >= 90) {
      autoExact.push(best);
      matchedEntryIds.add(best.entryLineId!);
      // Enregistre le matching
      await recordMatch(best, true);
    } else if (best.score >= 60) {
      autoFuzzy.push(best);
    }
  }

  // Transactions non matchées
  const unmatchedIds = new Set([
    ...autoExact.map((m) => m.bankTransactionId),
    ...autoFuzzy.map((m) => m.bankTransactionId),
  ]);
  const unmatched = bankTxs.filter((bt) => !unmatchedIds.has(bt.id));

  return { autoExact, autoFuzzy, unmatched };
}

/**
 * Enregistre un matching dans la base de données
 */
async function recordMatch(match: MatchResult, autoApprove: boolean) {
  const { error: reconError } = await supabase.from("reconciliations").insert({
    bank_transaction_id: match.bankTransactionId,
    entry_line_id: match.entryLineId,
    confidence: match.confidence === "auto_exact" ? "certain" : "probable",
  });

  if (reconError) throw new Error(reconError.message);

  // Met à jour la transaction bancaire
  const { error: txError } = await supabase
    .from("bank_transactions")
    .update({
      reconciled: autoApprove,
      matched_entry_line_id: match.entryLineId,
      match_confidence: match.confidence,
    })
    .eq("id", match.bankTransactionId);

  if (txError) throw new Error(txError.message);

  // Si auto-approuvé, lettrage automatique
  if (autoApprove) {
    await autoLetter(match);
  }
}

/**
 * Lettrage automatique : met à jour le statut de la facture concernée
 */
async function autoLetter(match: MatchResult) {
  // Cherche la facture liée à cette écriture
  const { data: entryLine } = await supabase
    .from("entry_lines")
    .select("entry_id")
    .eq("id", match.entryLineId)
    .single();

  if (!entryLine) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, third_party_id, amount_ttc")
    .eq("entry_id", entryLine.entry_id)
    .maybeSingle();

  if (invoice) {
    await supabase
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoice.id);
  }
}

/**
 * Confirme manuellement un matching fuzzy
 */
export async function confirmFuzzyMatch(match: MatchResult) {
  await recordMatch({ ...match, confidence: "manual" }, true);
}

/**
 * Supprime un matching (pour correction)
 */
export async function unmatchTransaction(bankTransactionId: string) {
  const { error } = await supabase
    .from("bank_transactions")
    .update({
      reconciled: false,
      matched_entry_line_id: null,
      match_confidence: null,
    })
    .eq("id", bankTransactionId);

  if (error) throw new Error(error.message);

  await supabase
    .from("reconciliations")
    .delete()
    .eq("bank_transaction_id", bankTransactionId);
}