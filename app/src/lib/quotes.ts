import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

// ============================================================================
// Module 2.1 — Devis clients
// ============================================================================

export type Quote = {
  id: string;
  client_id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string | null;
  total_ht: number;
  total_ttc: number;
  status: "draft" | "sent" | "accepted" | "refused" | "converted_to_invoice" | "expired";
  notes: string | null;
  client_name?: string;
  converted_to_invoice_id: string | null;
  created_at: string;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  amount_ht: number;
};

/** Récupère tous les devis */
export async function fetchQuotes(status?: string): Promise<Quote[]> {
  let query = supabase
    .from("quotes")
    .select("*, third_parties!inner(name)")
    .eq("company_id", COMPANY_ID)
    .order("quote_date", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    client_id: row.client_id as string,
    quote_number: row.quote_number as string,
    quote_date: row.quote_date as string,
    valid_until: row.valid_until as string | null,
    total_ht: Number(row.total_ht),
    total_ttc: Number(row.total_ttc),
    status: row.status as Quote["status"],
    notes: row.notes as string | null,
    client_name: (row.third_parties as Record<string, string>)?.name ?? "",
    converted_to_invoice_id: row.converted_to_invoice_id as string | null,
    created_at: row.created_at as string,
  }));
}

/** Récupère un devis avec ses lignes */
export async function fetchQuote(id: string): Promise<{ quote: Quote; lines: QuoteLine[] } | null> {
  const { data: q } = await supabase
    .from("quotes")
    .select("*, third_parties(name)")
    .eq("id", id)
    .eq("company_id", COMPANY_ID)
    .single();

  if (!q) return null;

  const { data: lines } = await supabase
    .from("quote_lines")
    .select("*")
    .eq("quote_id", id)
    .order("id");

  return {
    quote: {
      id: q.id,
      client_id: q.client_id,
      quote_number: q.quote_number,
      quote_date: q.quote_date,
      valid_until: q.valid_until,
      total_ht: Number(q.total_ht),
      total_ttc: Number(q.total_ttc),
      status: q.status,
      notes: q.notes,
      client_name: (q.third_parties as Record<string, string>)?.name ?? "",
      converted_to_invoice_id: q.converted_to_invoice_id,
      created_at: q.created_at,
    },
    lines: (lines ?? []).map((l) => ({
      ...l,
      amount_ht: Number(l.amount_ht),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      tva_rate: Number(l.tva_rate),
    })),
  };
}

export type CreateQuoteInput = {
  client_id: string;
  quote_date: string;
  valid_until?: string;
  notes?: string;
  lines: { description: string; quantity: number; unit_price: number; tva_rate: number }[];
};

/** Crée un devis */
export async function createQuote(input: CreateQuoteInput): Promise<string> {
  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date(input.quote_date).getFullYear(),
    p_prefix: "DEV",
  });

  const quoteNumber = `DEV-${new Date(input.quote_date).getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;

  const totals = input.lines.reduce(
    (acc, l) => {
      const ht = l.quantity * l.unit_price;
      const ttc = ht * (1 + l.tva_rate / 100);
      return { ht: acc.ht + ht, ttc: acc.ttc + ttc };
    },
    { ht: 0, ttc: 0 }
  );

  const { data: quote, error: qError } = await supabase
    .from("quotes")
    .insert({
      company_id: COMPANY_ID,
      client_id: input.client_id,
      quote_number: quoteNumber,
      quote_date: input.quote_date,
      valid_until: input.valid_until ?? null,
      total_ht: totals.ht,
      total_ttc: totals.ttc,
      notes: input.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (qError || !quote) throw new Error(qError?.message ?? "Échec création devis");

  const { error: linesError } = await supabase.from("quote_lines").insert(
    input.lines.map((l) => ({
      quote_id: quote.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tva_rate: l.tva_rate,
    }))
  );

  if (linesError) throw new Error(linesError.message);
  return quote.id;
}

/** Marque un devis comme envoyé */
export async function sendQuote(id: string) {
  const { error } = await supabase
    .from("quotes")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);
}

/** Transforme un devis accepté en facture client */
export async function convertQuoteToInvoice(quoteId: string): Promise<string> {
  const quoteData = await fetchQuote(quoteId);
  if (!quoteData) throw new Error("Devis introuvable");
  if (quoteData.quote.status !== "accepted") {
    throw new Error("Le devis doit être accepté avant d'être converti en facture");
  }

  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date().getFullYear(),
    p_prefix: "FAC",
  });

  const legalNumber = `FAC-${new Date().getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;

  // Crée la facture à partir du devis
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      company_id: COMPANY_ID,
      type: "client",
      third_party_id: quoteData.quote.client_id,
      invoice_number: legalNumber,
      legal_number: legalNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: quoteData.quote.valid_until ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      amount_ht: quoteData.quote.total_ht,
      tva_rate: 18.00,
      tva_amount: quoteData.quote.total_ttc - quoteData.quote.total_ht,
      amount_ttc: quoteData.quote.total_ttc,
      status: "imputed",
    })
    .select("id")
    .single();

  if (invError || !invoice) throw new Error(invError?.message ?? "Échec création facture");

  // Copie les lignes du devis vers la facture
  const { error: linesError } = await supabase.from("invoice_lines").insert(
    quoteData.lines.map((l) => ({
      invoice_id: invoice.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tva_rate: l.tva_rate,
      amount_ht: l.amount_ht,
    }))
  );

  if (linesError) throw new Error(linesError.message);

  // Met à jour le devis
  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "converted_to_invoice", converted_to_invoice_id: invoice.id })
    .eq("id", quoteId);

  if (updateError) throw new Error(updateError.message);

  return invoice.id;
}

/** Accepte ou refuse un devis */
export async function respondToQuote(quoteId: string, accepted: boolean) {
  const status = accepted ? "accepted" : "refused";
  const { error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("id", quoteId)
    .eq("company_id", COMPANY_ID);

  if (error) throw new Error(error.message);

  if (accepted) {
    await convertQuoteToInvoice(quoteId);
  }
}