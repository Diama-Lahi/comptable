import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchJournalLines } from "@/lib/ledger";

const TREASURY_ACCOUNTS = ["521", "531", "571", "585"];

export type RecurringCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: "mensuelle" | "trimestrielle" | "annuelle";
  next_due_date: string;
  active: boolean;
};

export async function fetchRecurringCharges(): Promise<RecurringCharge[]> {
  const { data } = await supabase
    .from("recurring_charges")
    .select("id, label, amount, frequency, next_due_date, active")
    .eq("company_id", COMPANY_ID)
    .order("next_due_date");
  return data ?? [];
}

export async function createRecurringCharge(params: {
  label: string;
  amount: number;
  frequency: "mensuelle" | "trimestrielle" | "annuelle";
  nextDueDate: string;
}) {
  const { error } = await supabase.from("recurring_charges").insert({
    company_id: COMPANY_ID,
    label: params.label,
    amount: params.amount,
    frequency: params.frequency,
    next_due_date: params.nextDueDate,
  });
  if (error) throw new Error(error.message);
}

export async function fetchCurrentTreasury(): Promise<number> {
  const lines = await fetchJournalLines({ to: new Date().toISOString().slice(0, 10) });
  return lines.filter((l) => TREASURY_ACCOUNTS.includes(l.account_code)).reduce((s, l) => s + l.debit - l.credit, 0);
}

export type ForecastPoint = { date: string; source: string; amount: number; runningBalance: number };

export async function computeForecast(): Promise<{ points: ForecastPoint[]; firstNegativeDate: string | null }> {
  const currentTreasury = await fetchCurrentTreasury();

  const { data: rows } = await supabase
    .from("cash_flow_forecast_inputs")
    .select("source, expected_date, amount, company_id")
    .eq("company_id", COMPANY_ID)
    .not("expected_date", "is", null)
    .order("expected_date");

  let running = currentTreasury;
  const points: ForecastPoint[] = [];
  let firstNegativeDate: string | null = null;

  for (const r of rows ?? []) {
    running += r.amount;
    points.push({ date: r.expected_date, source: r.source, amount: r.amount, runningBalance: running });
    if (running < 0 && !firstNegativeDate) firstNegativeDate = r.expected_date;
  }

  return { points, firstNegativeDate };
}
