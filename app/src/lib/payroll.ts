import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

const CHARGES_PERSONNEL = "661"; // Rémunérations directes versées au personnel
const CHARGES_SOCIALES = "664"; // Charges sociales
const PERSONNEL_DU = "421"; // Personnel — rémunérations dues
const SECU_SOCIALE = "431"; // Sécurité sociale (IPRES/CSS)
const RETENUES_SOURCE = "447"; // État — retenues à la source
const CAISSE = "571";

export type Employee = {
  id: string;
  full_name: string;
  position: string | null;
  hire_date: string | null;
  base_salary: number;
  social_regime: string | null;
  active: boolean;
};

export type PayrollRates = {
  employeeContributionRate: number | null;
  employerContributionRate: number | null;
  incomeTaxRate: number | null;
};

/** Taux forfaitaires configurés dans /parametres — approximation, pas les barèmes progressifs réels. */
export async function fetchPayrollRates(): Promise<PayrollRates> {
  const { data } = await supabase
    .from("companies")
    .select("employee_contribution_rate, employer_contribution_rate, income_tax_rate")
    .eq("id", COMPANY_ID)
    .single();

  return {
    employeeContributionRate: data?.employee_contribution_rate ?? null,
    employerContributionRate: data?.employer_contribution_rate ?? null,
    incomeTaxRate: data?.income_tax_rate ?? null,
  };
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, position, hire_date, base_salary, social_regime, active")
    .eq("company_id", COMPANY_ID)
    .order("full_name");
  return data ?? [];
}

export async function createEmployee(params: {
  fullName: string;
  position: string;
  hireDate: string;
  baseSalary: number;
  socialRegime: string;
}) {
  const { error } = await supabase.from("employees").insert({
    company_id: COMPANY_ID,
    full_name: params.fullName,
    position: params.position || null,
    hire_date: params.hireDate || null,
    base_salary: params.baseSalary,
    social_regime: params.socialRegime,
  });
  if (error) throw new Error(error.message);
}

export type Payslip = {
  id: string;
  employee_id: string;
  period_month: string;
  gross_salary: number;
  employee_contributions: number;
  employer_contributions: number;
  income_tax_withheld: number;
  net_salary: number;
  status: "draft" | "validated" | "paid";
  needs_review: boolean | null;
  employees: { full_name: string } | null;
};

export async function fetchPayslips(): Promise<Payslip[]> {
  const { data } = await supabase
    .from("payslips")
    .select(
      "id, employee_id, period_month, gross_salary, employee_contributions, employer_contributions, income_tax_withheld, net_salary, status, needs_review, employees(full_name)"
    )
    .order("period_month", { ascending: false });
  return (data as unknown as Payslip[]) ?? [];
}

// Tolérance au-delà de laquelle un salaire brut qui s'écarte du salaire de
// base contractuel de l'employé est considéré comme une exception (prime,
// absence...) plutôt qu'un calcul déterministe habituel — voir
// docs/architecture-automatisation-maximale.md, ligne "Paie".
const PAYSLIP_DEVIATION_TOLERANCE = 0.02;

/** Un bulletin conforme au salaire de base passe toujours automatiquement ; un écart part en revue. */
export function payslipNeedsReview(grossSalary: number, baseSalary: number): boolean {
  if (baseSalary <= 0) return true;
  return Math.abs(grossSalary - baseSalary) / baseSalary > PAYSLIP_DEVIATION_TOLERANCE;
}

/** Crée le bulletin et, si le salaire brut correspond au salaire de base habituel, le valide immédiatement (écriture générée sans revue humaine). */
export async function createPayslip(params: {
  employeeId: string;
  periodMonth: string;
  grossSalary: number;
  employeeContributions: number;
  employerContributions: number;
  incomeTaxWithheld: number;
}): Promise<{ autoValidated: boolean }> {
  await assertPeriodOpen(params.periodMonth);

  const { data: employee } = await supabase
    .from("employees")
    .select("base_salary")
    .eq("id", params.employeeId)
    .single();

  const needsReview = payslipNeedsReview(params.grossSalary, employee?.base_salary ?? 0);
  const netSalary = params.grossSalary - params.employeeContributions - params.incomeTaxWithheld;

  const { data: created, error } = await supabase
    .from("payslips")
    .insert({
      employee_id: params.employeeId,
      period_month: params.periodMonth,
      gross_salary: params.grossSalary,
      employee_contributions: params.employeeContributions,
      employer_contributions: params.employerContributions,
      income_tax_withheld: params.incomeTaxWithheld,
      net_salary: netSalary,
      status: "draft",
      needs_review: needsReview,
    })
    .select(
      "id, employee_id, period_month, gross_salary, employee_contributions, employer_contributions, income_tax_withheld, net_salary, status, needs_review, employees(full_name)"
    )
    .single();
  if (error || !created) throw new Error(error?.message ?? "Échec de création du bulletin");

  if (!needsReview) {
    await validatePayslip(created as unknown as Payslip);
    return { autoValidated: true };
  }
  return { autoValidated: false };
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

/** Valide un bulletin : génère l'écriture de charges de personnel (journal OD). */
export async function validatePayslip(payslip: Payslip) {
  await assertPeriodOpen(payslip.period_month);
  const journalId = await getJournalId("OD");
  const employeeName = payslip.employees?.full_name ?? "";

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: payslip.period_month,
      description: `Bulletin de paie — ${employeeName} (${payslip.period_month})`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const secuTotal = payslip.employee_contributions + payslip.employer_contributions;
  const lines = [
    { account_code: CHARGES_PERSONNEL, debit: payslip.gross_salary, credit: 0 },
    ...(payslip.employer_contributions > 0
      ? [{ account_code: CHARGES_SOCIALES, debit: payslip.employer_contributions, credit: 0 }]
      : []),
    { account_code: PERSONNEL_DU, debit: 0, credit: payslip.net_salary },
    ...(secuTotal > 0 ? [{ account_code: SECU_SOCIALE, debit: 0, credit: secuTotal }] : []),
    ...(payslip.income_tax_withheld > 0
      ? [{ account_code: RETENUES_SOURCE, debit: 0, credit: payslip.income_tax_withheld }]
      : []),
  ];

  const { error: linesError } = await supabase
    .from("entry_lines")
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase
    .from("payslips")
    .update({ status: "validated", entry_id: entry.id, needs_review: false })
    .eq("id", payslip.id);
  if (error) throw new Error(error.message);
}

/** Marque le bulletin payé : génère l'écriture de paiement du net (journal CA, simplification espèces). */
export async function markPayslipPaid(payslip: Payslip) {
  await assertPeriodOpen(new Date().toISOString().slice(0, 10));
  const journalId = await getJournalId("CA");
  const employeeName = payslip.employees?.full_name ?? "";

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      company_id: COMPANY_ID,
      journal_id: journalId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `Paiement salaire — ${employeeName} (${payslip.period_month})`,
      source: "manual",
      status: "validated",
    })
    .select("id")
    .single();
  if (entryError || !entry) throw new Error(entryError?.message ?? "Échec de création de l'écriture");

  const { error: linesError } = await supabase.from("entry_lines").insert([
    { entry_id: entry.id, account_code: PERSONNEL_DU, debit: payslip.net_salary, credit: 0 },
    { entry_id: entry.id, account_code: CAISSE, debit: 0, credit: payslip.net_salary },
  ]);
  if (linesError) throw new Error(linesError.message);

  const { error } = await supabase.from("payslips").update({ status: "paid" }).eq("id", payslip.id);
  if (error) throw new Error(error.message);
}
