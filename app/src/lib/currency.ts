import { supabase } from "@/lib/supabase";

export type ExchangeRate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate: number;
};

export async function fetchExchangeRates(): Promise<ExchangeRate[]> {
  const { data } = await supabase
    .from("exchange_rates")
    .select("id, from_currency, to_currency, rate_date, rate")
    .order("rate_date", { ascending: false });
  return data ?? [];
}

export async function createExchangeRate(params: { fromCurrency: string; rateDate: string; rate: number }) {
  const { error } = await supabase.from("exchange_rates").insert({
    from_currency: params.fromCurrency,
    to_currency: "XOF",
    rate_date: params.rateDate,
    rate: params.rate,
  });
  if (error) throw new Error(error.message);
}

/** Taux le plus récent connu à une date donnée ou avant (from_currency -> XOF). */
export async function getRateForDate(fromCurrency: string, date: string): Promise<number | null> {
  if (fromCurrency === "XOF") return 1;
  const { data } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", "XOF")
    .lte("rate_date", date)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.rate ?? null;
}
