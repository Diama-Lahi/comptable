import { supabase, COMPANY_ID } from "@/lib/supabase";

const FRAIS_BANCAIRES = "631"; // Frais bancaires

export type MobileMoneyFee = {
  id: string;
  cash_bank_account_id: string;
  fee_amount: number;
  created_at: string;
};

export async function fetchFees(cashBankAccountId: string): Promise<MobileMoneyFee[]> {
  const { data } = await supabase
    .from("mobile_money_fees")
    .select("id, cash_bank_account_id, fee_amount, created_at")
    .eq("cash_bank_account_id", cashBankAccountId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function getJournalId(code: string): Promise<string> {
  const { data, error } = await supabase
    .from("journals")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .eq("code", code)
    .single();
  if (error || !data) throw new Error(error?.message ?? `Journal ${code} introuvable`);
  return data.id;
}

/** Enregistre un frais Wave/Orange Money : écriture (631 débit, compte trésorerie crédit). */
export async function recordFee(params: {
  cashBankAccountId: string;
  accountCode: string;
  label: string;
  feeAmount: number;
  feeDate: string;
}) {
  const journalId = await getJournalId("BQ");
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: params.feeDate,
      description: `Frais mobile money — ${params.label}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: FRAIS_BANCAIRES, debit: params.feeAmount, credit: 0 },
    { entry_id: entry.id, account_code: params.accountCode, debit: 0, credit: params.feeAmount },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase
    .from("mobile_money_fees")
    .insert({ cash_bank_account_id: params.cashBankAccountId, fee_amount: params.feeAmount });
  if (error) throw new Error(error.message);
}
