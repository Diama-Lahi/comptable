import { supabase, COMPANY_ID } from "@/lib/supabase";

const CAISSE = "571";
const AVANCES_CLIENTS = "4191";
const TVA_COLLECTEE = "4431";
const CLIENTS = "411";

export type CustomerDeposit = {
  id: string;
  third_party_id: string | null;
  deposit_date: string;
  amount: number;
  tva_declared: boolean;
  final_invoice_id: string | null;
  status: "open" | "applied";
  third_parties: { name: string } | null;
};

export async function fetchDeposits(): Promise<CustomerDeposit[]> {
  const { data } = await supabase
    .from("customer_deposits")
    .select("id, third_party_id, deposit_date, amount, tva_declared, final_invoice_id, status, third_parties(name)")
    .eq("company_id", COMPANY_ID)
    .order("deposit_date", { ascending: false });
  return (data as unknown as CustomerDeposit[]) ?? [];
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

/** Enregistre un acompte client reçu : encaissement + écriture (571 / 4191, avec TVA si déjà due). */
export async function createDeposit(params: {
  thirdPartyName: string;
  depositDate: string;
  amount: number;
  tvaDeclared: boolean;
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

  const journalId = await getJournalId("CA");
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: params.depositDate,
      description: `Acompte reçu — ${params.thirdPartyName}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const lines = params.tvaDeclared
    ? (() => {
        const ht = Math.round((params.amount / 1.18) * 100) / 100;
        const tva = Math.round((params.amount - ht) * 100) / 100;
        return [
          { account_code: CAISSE, debit: params.amount, credit: 0 },
          { account_code: AVANCES_CLIENTS, debit: 0, credit: ht },
          { account_code: TVA_COLLECTEE, debit: 0, credit: tva },
        ];
      })()
    : [
        { account_code: CAISSE, debit: params.amount, credit: 0 },
        { account_code: AVANCES_CLIENTS, debit: 0, credit: params.amount },
      ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase.from("customer_deposits").insert({
    company_id: COMPANY_ID,
    third_party_id: thirdPartyId,
    deposit_date: params.depositDate,
    amount: params.amount,
    tva_declared: params.tvaDeclared,
    entry_id: entry.id,
  });
  if (error) throw new Error(error.message);
}

/** Applique l'acompte à la facture finale : solde le compte d'avance contre le compte client. */
export async function applyDepositToInvoice(deposit: CustomerDeposit, invoiceId: string) {
  const journalId = await getJournalId("OD");
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `Application acompte — ${deposit.third_parties?.name ?? ""}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const htPortion = deposit.tva_declared ? Math.round((deposit.amount / 1.18) * 100) / 100 : deposit.amount;

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: AVANCES_CLIENTS, debit: htPortion, credit: 0 },
    { entry_id: entry.id, account_code: CLIENTS, debit: 0, credit: htPortion },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase
    .from("customer_deposits")
    .update({ status: "applied", final_invoice_id: invoiceId })
    .eq("id", deposit.id);
  if (error) throw new Error(error.message);
}
