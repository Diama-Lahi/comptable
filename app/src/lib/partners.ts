import { supabase, COMPANY_ID } from "@/lib/supabase";

const COMPTE_COURANT_ASSOCIE = "455"; // Comptes courants des associés
const CAISSE = "571";

export type Partner = { id: string; name: string };

export async function fetchPartners(): Promise<Partner[]> {
  const { data } = await supabase.from("partners").select("id, name").eq("company_id", COMPANY_ID).order("name");
  return data ?? [];
}

export async function createPartner(name: string) {
  const { error } = await supabase.from("partners").insert({ company_id: COMPANY_ID, name });
  if (error) throw new Error(error.message);
}

export type PartnerMovement = {
  id: string;
  partner_id: string;
  movement_date: string;
  type: "apport" | "retrait" | "interet";
  amount: number;
  partners: { name: string } | null;
};

export async function fetchMovements(): Promise<PartnerMovement[]> {
  const { data } = await supabase
    .from("partner_current_account_movements")
    .select("id, partner_id, movement_date, type, amount, partners(name)")
    .order("movement_date", { ascending: false });
  return (data as unknown as PartnerMovement[]) ?? [];
}

export async function fetchPartnerBalance(partnerId: string): Promise<number> {
  const { data } = await supabase
    .from("partner_current_account_movements")
    .select("type, amount")
    .eq("partner_id", partnerId);
  return (data ?? []).reduce((s, m) => s + (m.type === "retrait" ? -m.amount : m.amount), 0);
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
 * Enregistre un mouvement de compte courant associé : écriture générée (journal OD, 455/571).
 * Apport : la société reçoit de l'argent (débit caisse, crédit 455).
 * Retrait/intérêt : la société sort de l'argent (débit 455, crédit caisse).
 */
export async function createMovement(params: {
  partnerId: string;
  partnerName: string;
  movementDate: string;
  type: "apport" | "retrait" | "interet";
  amount: number;
}) {
  const journalId = await getJournalId("OD");

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: params.movementDate,
      description: `Compte courant associé — ${params.type} — ${params.partnerName}`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const lines =
    params.type === "apport"
      ? [
          { account_code: CAISSE, debit: params.amount, credit: 0 },
          { account_code: COMPTE_COURANT_ASSOCIE, debit: 0, credit: params.amount },
        ]
      : [
          { account_code: COMPTE_COURANT_ASSOCIE, debit: params.amount, credit: 0 },
          { account_code: CAISSE, debit: 0, credit: params.amount },
        ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase.from("partner_current_account_movements").insert({
    partner_id: params.partnerId,
    movement_date: params.movementDate,
    type: params.type,
    amount: params.amount,
    entry_id: entry.id,
  });
  if (error) throw new Error(error.message);
}
