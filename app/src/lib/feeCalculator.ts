import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// MODULE CABINET — Calculateur d'honoraires
// Facturation automatique des clients du cabinet selon règles paramétrables
// ============================================================================

export type FeeRule = {
  id: string;
  rule_name: string;
  calculation_base: "per_entry" | "per_invoice" | "percentage_turnover" | "flat_fee";
  rate: number;
  min_fee: number | null;
  max_fee: number | null;
  billing_period: "monthly" | "quarterly" | "annually";
  active: boolean;
};

export type FeeGeneration = {
  id: string;
  client_company_id: string;
  client_company_name?: string;
  period_from: string;
  period_to: string;
  rule_id: string;
  amount_calculated: number;
  invoice_id: string | null;
  status: "calculated" | "invoiced" | "paid";
};

/** Récupère les règles d'honoraires actives */
export async function fetchFeeRules(): Promise<FeeRule[]> {
  const { data } = await supabase
    .from("fee_rules")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true)
    .order("rule_name");

  return (data ?? []).map((r) => ({
    id: r.id as string,
    rule_name: r.rule_name as string,
    calculation_base: r.calculation_base as FeeRule["calculation_base"],
    rate: Number(r.rate),
    min_fee: r.min_fee ? Number(r.min_fee) : null,
    max_fee: r.max_fee ? Number(r.max_fee) : null,
    billing_period: r.billing_period as FeeRule["billing_period"],
    active: r.active as boolean,
  }));
}

function mapFeeRule(r: Record<string, unknown>): FeeRule {
  return {
    id: r.id as string,
    rule_name: r.rule_name as string,
    calculation_base: r.calculation_base as FeeRule["calculation_base"],
    rate: Number(r.rate),
    min_fee: r.min_fee ? Number(r.min_fee) : null,
    max_fee: r.max_fee ? Number(r.max_fee) : null,
    billing_period: r.billing_period as FeeRule["billing_period"],
    active: r.active as boolean,
  };
}

/** Crée ou met à jour une règle d'honoraires */
export async function saveFeeRule(input: {
  id?: string;
  rule_name: string;
  calculation_base: FeeRule["calculation_base"];
  rate: number;
  min_fee?: number;
  max_fee?: number;
  billing_period?: FeeRule["billing_period"];
}): Promise<string> {
  const payload = {
    company_id: COMPANY_ID,
    rule_name: input.rule_name,
    calculation_base: input.calculation_base,
    rate: input.rate,
    min_fee: input.min_fee ?? null,
    max_fee: input.max_fee ?? null,
    billing_period: input.billing_period ?? "monthly",
    active: true,
  };

  if (input.id) {
    const { error } = await supabase.from("fee_rules").update(payload).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }

  const { data, error } = await supabase.from("fee_rules").insert(payload).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Échec création règle");
  return data.id;
}

/**
 * Calcule les honoraires pour une entreprise cliente sur une période donnée
 */
export async function calculateFee(
  clientCompanyId: string,
  ruleId: string,
  periodFrom: string,
  periodTo: string
): Promise<{ amount: number; breakdown: { label: string; value: number }[] }> {
  const { data: rules } = await supabase
    .from("fee_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("active", true)
    .single();

  if (!rules) throw new Error("Règle d'honoraires introuvable");

  const rule = await mapFeeRule(rules);
  const breakdown: { label: string; value: number }[] = [];

  switch (rule.calculation_base) {
    case "flat_fee": {
      return {
        amount: rule.rate,
        breakdown: [{ label: "Forfait fixe", value: rule.rate }],
      };
    }

    case "per_entry": {
      // Compte le nombre d'écritures sur la période
      const { data: entries, error } = await supabase
        .from("entries")
        .select("id", { count: "exact" })
        .eq("company_id", clientCompanyId)
        .gte("entry_date", periodFrom)
        .lte("entry_date", periodTo);

      const count = entries?.length ?? 0;
      const amount = count * rule.rate;
      breakdown.push({ label: `${count} écriture(s) × ${rule.rate} FCFA`, value: amount });
      return { amount, breakdown };
    }

    case "per_invoice": {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("id", { count: "exact" })
        .eq("company_id", clientCompanyId)
        .gte("invoice_date", periodFrom)
        .lte("invoice_date", periodTo);

      const count = invoices?.length ?? 0;
      const amount = count * rule.rate;
      breakdown.push({ label: `${count} facture(s) × ${rule.rate} FCFA`, value: amount });
      return { amount, breakdown };
    }

    case "percentage_turnover": {
      // Calcule le CA sur la période
      const { data: lines } = await supabase
        .from("entry_lines")
        .select("credit")
        .eq("account_code", "701")
        .gte("entry_date", periodFrom)
        .lte("entry_date", periodTo);

      const turnover = (lines ?? []).reduce((s, l) => s + Number(l.credit), 0);
      const amount = turnover * (rule.rate / 100);
      breakdown.push({ label: `CA ${turnover.toLocaleString("fr-FR")} × ${rule.rate}%`, value: amount });
      return { amount, breakdown };
    }

    default:
      throw new Error(`Base de calcul non supportée: ${rule.calculation_base}`);
  }
}

/**
 * Génère la facture d'honoraires pour une entreprise cliente
 */
export async function generateFeeInvoice(
  clientCompanyId: string,
  ruleId: string,
  periodFrom: string,
  periodTo: string
): Promise<string> {
  const { data: client } = await supabase
    .from("companies")
    .select("name")
    .eq("id", clientCompanyId)
    .single();

  if (!client) throw new Error("Entreprise cliente introuvable");

  const { amount, breakdown } = await calculateFee(clientCompanyId, ruleId, periodFrom, periodTo);

  // Applique les planchers/plafonds
  const { data: rule } = await supabase.from("fee_rules").select("*").eq("id", ruleId).single();
  let finalAmount = amount;
  if (rule?.min_fee && finalAmount < Number(rule.min_fee)) finalAmount = Number(rule.min_fee);
  if (rule?.max_fee && finalAmount > Number(rule.max_fee)) finalAmount = Number(rule.max_fee);

  // Crée la facture d'honoraires (dans la société du cabinet)
  const { data: nextNum } = await supabase.rpc("next_legal_number", {
    p_company_id: COMPANY_ID,
    p_fiscal_year: new Date().getFullYear(),
    p_prefix: "HON",
  });

  const invoiceNumber = `HON-${new Date().getFullYear()}-${String(nextNum ?? 1).padStart(6, "0")}`;

  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      company_id: COMPANY_ID,
      type: "client",
      third_party_id: clientCompanyId, // le client est une autre entreprise suivie
      invoice_number: invoiceNumber,
      legal_number: invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      amount_ht: finalAmount,
      tva_rate: 18,
      tva_amount: finalAmount * 0.18,
      amount_ttc: finalAmount * 1.18,
      status: "approved",
      description: `Honoraires ${periodFrom} → ${periodTo}`,
    })
    .select("id")
    .single();

  if (invError || !invoice) throw new Error(invError?.message ?? "Échec création facture honoraires");

  // Enregistre la génération
  const { error: genError } = await supabase.from("fee_generations").insert({
    company_id: COMPANY_ID,
    client_company_id: clientCompanyId,
    period_from: periodFrom,
    period_to: periodTo,
    rule_id: ruleId,
    amount_calculated: finalAmount,
    invoice_id: invoice.id,
    status: "invoiced",
  });

  if (genError) throw new Error(genError.message);

  return invoice.id;
}

/** Récupère l'historique des générations d'honoraires */
export async function fetchFeeHistory(): Promise<FeeGeneration[]> {
  const { data } = await supabase
    .from("fee_generations")
    .select("*, companies!inner(name)")
    .eq("company_id", COMPANY_ID)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    client_company_id: r.client_company_id as string,
    client_company_name: (r.companies as Record<string, unknown>)?.name as string ?? "",
    period_from: r.period_from as string,
    period_to: r.period_to as string,
    rule_id: r.rule_id as string,
    amount_calculated: Number(r.amount_calculated),
    invoice_id: r.invoice_id as string | null,
    status: r.status as FeeGeneration["status"],
  }));
}

/** Récupère les entreprises clientes du cabinet */
export async function fetchClientCompanies() {
  const { data } = await supabase
    .from("companies")
    .select("id, name, tax_id")
    .neq("id", COMPANY_ID) // exclut la société du cabinet
    .order("name");

  return data ?? [];
}