import { supabase, COMPANY_ID } from "@/lib/supabase";

export type CommitmentType =
  | "caution_donnee"
  | "caution_recue"
  | "garantie_bancaire"
  | "credit_bail"
  | "litige"
  | "autre";

export type Commitment = {
  id: string;
  type: CommitmentType;
  description: string | null;
  amount: number | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "closed";
};

export async function fetchCommitments(): Promise<Commitment[]> {
  const { data } = await supabase
    .from("off_balance_commitments")
    .select("id, type, description, amount, start_date, end_date, status")
    .eq("company_id", COMPANY_ID)
    .order("start_date", { ascending: false });
  return data ?? [];
}

export async function createCommitment(params: {
  type: CommitmentType;
  description: string;
  amount: number | null;
  startDate: string;
  endDate: string;
}) {
  const { error } = await supabase.from("off_balance_commitments").insert({
    company_id: COMPANY_ID,
    type: params.type,
    description: params.description || null,
    amount: params.amount,
    start_date: params.startDate || null,
    end_date: params.endDate || null,
  });
  if (error) throw new Error(error.message);
}

export async function closeCommitment(id: string) {
  const { error } = await supabase.from("off_balance_commitments").update({ status: "closed" }).eq("id", id);
  if (error) throw new Error(error.message);
}
