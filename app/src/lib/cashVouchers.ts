import { supabase, COMPANY_ID } from "@/lib/supabase";
import { getAutomationSettings } from "@/lib/imputation";
import { assertPeriodOpen } from "@/lib/closing";

export type CashVoucher = {
  id: string;
  voucher_number: number;
  voucher_date: string;
  type: "entree" | "sortie";
  amount: number;
  motif: string | null;
  beneficiary: string | null;
  account_code: string | null;
  cash_bank_account_id: string | null;
  entry_id: string | null;
  needs_review: boolean | null;
  created_at: string;
};

export async function fetchCashVouchers(): Promise<CashVoucher[]> {
  const { data } = await supabase
    .from("cash_vouchers")
    .select(
      "id, voucher_number, voucher_date, type, amount, motif, beneficiary, account_code, cash_bank_account_id, entry_id, needs_review, created_at"
    )
    .eq("company_id", COMPANY_ID)
    .order("voucher_date", { ascending: false })
    .limit(30);
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

/**
 * Crée le bon de caisse et génère systématiquement l'écriture de trésorerie
 * correspondante (mouvement déterministe une fois les comptes choisis).
 * Seul le drapeau `needs_review` distingue un montant sous le plafond
 * (passe inaperçu) d'un montant au-dessus (remonte dans /exceptions) — voir
 * docs/architecture-automatisation-maximale.md, ligne "Bon de caisse".
 */
export async function createCashVoucher(params: {
  cashAccountCode: string; // compte 521/571 du compte caisse/banque concerné
  type: "entree" | "sortie";
  amount: number;
  motif: string;
  beneficiary: string;
  accountCode: string; // compte de contrepartie (charge, produit, tiers...)
  voucherDate: string;
  cashBankAccountId: string | null;
}): Promise<{ needsReview: boolean }> {
  await assertPeriodOpen(params.voucherDate);

  const settings = await getAutomationSettings();
  const needsReview = params.amount > settings.cashVoucherAutoLimit;

  const journalId = await getJournalId("CA");
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: params.voucherDate,
      description: `Bon de caisse ${params.type === "entree" ? "(entrée)" : "(sortie)"} — ${params.motif}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const lines =
    params.type === "sortie"
      ? [
          { account_code: params.accountCode, debit: params.amount, credit: 0 },
          { account_code: params.cashAccountCode, debit: 0, credit: params.amount },
        ]
      : [
          { account_code: params.cashAccountCode, debit: params.amount, credit: 0 },
          { account_code: params.accountCode, debit: 0, credit: params.amount },
        ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase.from("cash_vouchers").insert({
    company_id: COMPANY_ID,
    voucher_date: params.voucherDate,
    type: params.type,
    amount: params.amount,
    motif: params.motif || null,
    beneficiary: params.beneficiary || null,
    account_code: params.accountCode,
    cash_bank_account_id: params.cashBankAccountId,
    entry_id: entry.id,
    needs_review: needsReview,
  });
  if (error) throw new Error(error.message);

  return { needsReview };
}
