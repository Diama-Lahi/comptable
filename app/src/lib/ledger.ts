import { supabase, COMPANY_ID } from "@/lib/supabase";

export type JournalEntryLine = {
  entry_id: string;
  entry_date: string;
  journal_code: string;
  reference: string | null;
  description: string | null;
  account_code: string;
  label: string | null;
  debit: number;
  credit: number;
  cost_center_id: string | null;
};

type RawRow = {
  entry_id: string;
  account_code: string;
  label: string | null;
  debit: number;
  credit: number;
  cost_center_id: string | null;
  entries: {
    entry_date: string;
    reference: string | null;
    description: string | null;
    journals: { code: string };
  };
};

/** Écritures + lignes, triées par date, filtrables par journal et période. */
export async function fetchJournalLines(filters: {
  journalId?: string;
  from?: string;
  to?: string;
}): Promise<JournalEntryLine[]> {
  let query = supabase
    .from("entry_lines")
    .select(
      "entry_id, account_code, label, debit, credit, cost_center_id, entries!inner(entry_date, reference, description, company_id, journal_id, journals(code))"
    )
    .eq("entries.company_id", COMPANY_ID);

  if (filters.journalId) query = query.eq("entries.journal_id", filters.journalId);
  if (filters.from) query = query.gte("entries.entry_date", filters.from);
  if (filters.to) query = query.lte("entries.entry_date", filters.to);

  const { data } = await query;

  return ((data ?? []) as unknown as RawRow[])
    .map((r) => ({
      entry_id: r.entry_id,
      entry_date: r.entries.entry_date,
      journal_code: r.entries.journals.code,
      reference: r.entries.reference,
      description: r.entries.description,
      account_code: r.account_code,
      label: r.label,
      debit: r.debit,
      credit: r.credit,
      cost_center_id: r.cost_center_id,
    }))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

export type LedgerLine = JournalEntryLine & { balance: number };

/** Un compte est normalement débiteur (actif/charge) ou créditeur (passif/produit). */
function isDebitNormal(accountType: string) {
  return accountType === "actif" || accountType === "charge";
}

/** Grand livre d'un compte : lignes triées par date avec solde cumulé. */
export function computeAccountLedger(lines: JournalEntryLine[], accountCode: string, accountType: string): LedgerLine[] {
  const debitNormal = isDebitNormal(accountType);
  let running = 0;
  return lines
    .filter((l) => l.account_code === accountCode)
    .map((l) => {
      running += debitNormal ? l.debit - l.credit : l.credit - l.debit;
      return { ...l, balance: running };
    });
}

export type TrialBalanceRow = {
  account_code: string;
  label: string;
  account_type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
};

/** Balance générale : total débit/crédit et solde par compte mouvementé. */
export function computeTrialBalance(
  lines: JournalEntryLine[],
  accounts: { code: string; label: string; account_type: string }[]
): TrialBalanceRow[] {
  const byAccount = new Map<string, { totalDebit: number; totalCredit: number }>();
  for (const l of lines) {
    const acc = byAccount.get(l.account_code) ?? { totalDebit: 0, totalCredit: 0 };
    acc.totalDebit += l.debit;
    acc.totalCredit += l.credit;
    byAccount.set(l.account_code, acc);
  }

  return Array.from(byAccount.entries())
    .map(([code, totals]) => {
      const account = accounts.find((a) => a.code === code);
      const debitNormal = account ? isDebitNormal(account.account_type) : true;
      const balance = debitNormal
        ? totals.totalDebit - totals.totalCredit
        : totals.totalCredit - totals.totalDebit;
      return {
        account_code: code,
        label: account?.label ?? "(compte inconnu)",
        account_type: account?.account_type ?? "",
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        balance,
      };
    })
    .sort((a, b) => a.account_code.localeCompare(b.account_code));
}
