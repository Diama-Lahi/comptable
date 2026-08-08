import { supabase, COMPANY_ID } from "@/lib/supabase";

export type CashBankAccount = {
  id: string;
  type: "banque" | "caisse";
  label: string;
  currency: string;
  account_code: string;
  account_number: string | null;
  provider: string | null;
  settlement_delay_days: number | null;
  active: boolean;
};

export async function fetchCashAccounts(): Promise<CashBankAccount[]> {
  const { data } = await supabase
    .from("cash_bank_accounts")
    .select("id, type, label, currency, account_code, account_number, provider, settlement_delay_days, active")
    .eq("company_id", COMPANY_ID)
    .order("label");
  return data ?? [];
}

export async function createCashAccount(params: {
  type: "banque" | "caisse";
  label: string;
  currency: string;
  accountCode: string;
  accountNumber: string;
  provider: string;
  settlementDelayDays: number;
}) {
  const { error } = await supabase.from("cash_bank_accounts").insert({
    company_id: COMPANY_ID,
    type: params.type,
    label: params.label,
    currency: params.currency,
    account_code: params.accountCode,
    account_number: params.accountNumber || null,
    provider: params.provider || null,
    settlement_delay_days: params.settlementDelayDays || 0,
  });
  if (error) throw new Error(error.message);
}
