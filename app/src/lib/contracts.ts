import { supabase, COMPANY_ID } from "@/lib/supabase";
import { createEntryFromInvoice, recordImputation } from "@/lib/imputation";
import { nextLegalNumber } from "@/lib/legalInvoicing";

export type Contract = {
  id: string;
  third_party_id: string | null;
  label: string;
  amount: number;
  frequency: "mensuelle" | "annuelle";
  start_date: string;
  end_date: string | null;
  status: "active" | "suspended" | "terminated";
  default_account_code: string | null;
  third_parties: { name: string } | null;
};

export async function fetchContracts(): Promise<Contract[]> {
  const { data } = await supabase
    .from("contracts")
    .select(
      "id, third_party_id, label, amount, frequency, start_date, end_date, status, default_account_code, third_parties(name)"
    )
    .eq("company_id", COMPANY_ID)
    .order("start_date", { ascending: false });
  return (data as unknown as Contract[]) ?? [];
}

export async function createContract(params: {
  thirdPartyName: string;
  label: string;
  amount: number;
  frequency: "mensuelle" | "annuelle";
  startDate: string;
  defaultAccountCode: string;
}) {
  const { data: existing } = await supabase
    .from("third_parties")
    .select("id")
    .eq("company_id", COMPANY_ID)
    .ilike("name", params.thirdPartyName.trim())
    .maybeSingle();

  let thirdPartyId: string;
  if (existing) {
    thirdPartyId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("third_parties")
      .insert({ company_id: COMPANY_ID, type: "client", name: params.thirdPartyName.trim() })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Échec de création du client");
    thirdPartyId = created.id;
  }

  const { error } = await supabase.from("contracts").insert({
    company_id: COMPANY_ID,
    third_party_id: thirdPartyId,
    label: params.label,
    amount: params.amount,
    frequency: params.frequency,
    start_date: params.startDate,
    default_account_code: params.defaultAccountCode,
  });
  if (error) throw new Error(error.message);
}

/** Génère la facture récurrente pour une période donnée (si pas déjà générée), imputée automatiquement. */
export async function generateRecurringInvoice(contract: Contract, periodDate: string): Promise<"created" | "exists"> {
  const { data: existingLog } = await supabase
    .from("recurring_invoice_log")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("period_date", periodDate)
    .maybeSingle();
  if (existingLog) return "exists";

  const year = new Date(periodDate).getFullYear();
  const legalNumber = await nextLegalNumber(year);
  const tvaRate = 18;
  const ht = Math.round((contract.amount / (1 + tvaRate / 100)) * 100) / 100;
  const tva = Math.round((contract.amount - ht) * 100) / 100;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      company_id: COMPANY_ID,
      type: "client",
      third_party_id: contract.third_party_id,
      invoice_number: `${contract.label} — ${periodDate}`,
      legal_number: legalNumber,
      invoice_date: periodDate,
      amount_ht: ht,
      tva_rate: tvaRate,
      tva_amount: tva,
      amount_ttc: contract.amount,
      status: "imputed",
    })
    .select("id")
    .single();
  if (invoiceError || !invoice) throw new Error(invoiceError?.message ?? "Échec de création de la facture");

  if (contract.default_account_code) {
    const entryId = await createEntryFromInvoice({
      type: "client",
      entryDate: periodDate,
      reference: legalNumber,
      description: contract.label,
      accountCode: contract.default_account_code,
      amountHt: ht,
      tvaAmount: tva,
      amountTtc: contract.amount,
    });
    await supabase.from("invoices").update({ entry_id: entryId }).eq("id", invoice.id);
    if (contract.third_party_id) await recordImputation(contract.third_party_id, contract.default_account_code);
  }

  const { error: logError } = await supabase
    .from("recurring_invoice_log")
    .insert({ contract_id: contract.id, invoice_id: invoice.id, period_date: periodDate });
  if (logError) throw new Error(logError.message);

  return "created";
}
