import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchJournalLines } from "@/lib/ledger";

const TREASURY_ACCOUNTS = ["521", "531", "571", "585"];
const CLIENTS_ACCOUNT = "411";
const FOURNISSEURS_ACCOUNT = "401";

export type DashboardKpis = {
  chiffreAffaires: number;
  charges: number;
  resultatNet: number;
  tresorerie: number;
  creancesClients: number;
  dettesFournisseurs: number;
  facturesClientsImpayees: { count: number; total: number };
  facturesFournisseursImpayees: { count: number; total: number };
};

export async function computeKpis(from: string, to: string): Promise<DashboardKpis> {
  const [flowLines, balanceLines, invoices] = await Promise.all([
    fetchJournalLines({ from, to }),
    fetchJournalLines({ to }),
    supabase
      .from("invoices")
      .select("type, amount_ttc, status")
      .eq("company_id", COMPANY_ID)
      .not("status", "in", "(paid,archived)"),
  ]);

  const chiffreAffaires = flowLines
    .filter((l) => l.account_code.startsWith("7"))
    .reduce((s, l) => s + l.credit - l.debit, 0);

  const charges = flowLines
    .filter((l) => l.account_code.startsWith("6"))
    .reduce((s, l) => s + l.debit - l.credit, 0);

  const tresorerie = balanceLines
    .filter((l) => TREASURY_ACCOUNTS.includes(l.account_code))
    .reduce((s, l) => s + l.debit - l.credit, 0);

  const creancesClients = balanceLines
    .filter((l) => l.account_code === CLIENTS_ACCOUNT)
    .reduce((s, l) => s + l.debit - l.credit, 0);

  const dettesFournisseurs = balanceLines
    .filter((l) => l.account_code === FOURNISSEURS_ACCOUNT)
    .reduce((s, l) => s + l.credit - l.debit, 0);

  const invoiceRows = invoices.data ?? [];
  const summarize = (type: "client" | "fournisseur") => {
    const rows = invoiceRows.filter((i) => i.type === type);
    return { count: rows.length, total: rows.reduce((s, i) => s + (i.amount_ttc ?? 0), 0) };
  };

  return {
    chiffreAffaires,
    charges,
    resultatNet: chiffreAffaires - charges,
    tresorerie,
    creancesClients,
    dettesFournisseurs,
    facturesClientsImpayees: summarize("client"),
    facturesFournisseursImpayees: summarize("fournisseur"),
  };
}

// Seuils couramment cités pour l'obligation de commissaire aux comptes (SARL, AUDCIF révisé) —
// à reconfirmer auprès d'un professionnel avant toute décision, ces seuils évoluent.
const AUDIT_THRESHOLD_REVENUE = 250_000_000;
const AUDIT_THRESHOLD_EMPLOYEES = 50;

export type AuditThresholdCheck = {
  annualRevenueEstimate: number | null;
  employeeCountEstimate: number | null;
  approaching: boolean;
};

export async function fetchAuditThresholdCheck(): Promise<AuditThresholdCheck> {
  const { data } = await supabase
    .from("companies")
    .select("annual_revenue_estimate, employee_count_estimate")
    .eq("id", COMPANY_ID)
    .single();

  const annualRevenueEstimate = data?.annual_revenue_estimate ?? null;
  const employeeCountEstimate = data?.employee_count_estimate ?? null;

  const approaching =
    (annualRevenueEstimate !== null && annualRevenueEstimate >= AUDIT_THRESHOLD_REVENUE * 0.8) ||
    (employeeCountEstimate !== null && employeeCountEstimate >= AUDIT_THRESHOLD_EMPLOYEES * 0.8);

  return { annualRevenueEstimate, employeeCountEstimate, approaching };
}
