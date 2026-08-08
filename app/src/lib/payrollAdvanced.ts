import { supabase, COMPANY_ID } from "@/lib/supabase";
import { calculateIR } from "@/lib/algorithms";

// ============================================================================
// PAIE AVANCÉE — IR Progressif Sénégal, IPRES/CSS, DNS, Provisions Congés
// ============================================================================

export type PayrollConfig = {
  ipresRegimeGeneral: number;    // Taux IPRES Régime Général (ex: 0.056)
  ipresCadre: number;             // Taux cadre (ex: 0.086)
  cssPrestationsFamiliales: number; // CSS PF
  cssAccidentsTravail: number;    // CSS AT
  ipresPartSalariale: number;     // Part salariale IPRES
  cssPartSalariale: number;       // Part salariale CSS
  plafondSecuriteSociale: number; // Plafond annuel
};

const DEFAULT_CONFIG: PayrollConfig = {
  ipresRegimeGeneral: 0.14,      // 14% part patronale
  ipresCadre: 0.086,
  cssPrestationsFamiliales: 0.07, // 7%
  cssAccidentsTravail: 0.03,     // 3% (variable selon risque)
  ipresPartSalariale: 0.056,     // 5.6% retenue salarié
  cssPartSalariale: 0.0,         // CSS part salariale (gratuit)
  plafondSecuriteSociale: 5400000, // Plafond annuel FCFA
};

export type Employee = {
  id: string;
  full_name: string;
  position: string | null;
  hire_date: string | null;
  base_salary: number;
  social_regime: string | null;
  active: boolean;
};

export type PayslipDetail = {
  employeeId: string;
  employeeName: string;
  periodMonth: string;
  grossSalary: number;
  // Retenues salariales
  irWithheld: number;
  ipresEmployee: number;
  cssEmployee: number;
  totalDeductions: number;
  // Charges patronales
  ipresEmployer: number;
  cssEmployer: number;
  cfceEmployer: number;          // CFCE 3% masse salariale
  totalEmployerCharges: number;
  // Net
  netSalary: number;
  totalCost: number;             // Coût total employeur
};

// ---------------------------------------------------------------------------
// 1. CALCUL DU BULLETIN DE SALAIRE (Code du Travail Sénégalais)
// ---------------------------------------------------------------------------

export async function calculatePayslip(
  employeeId: string,
  periodMonth: string,
  config: PayrollConfig = DEFAULT_CONFIG
): Promise<PayslipDetail> {
  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .eq("company_id", COMPANY_ID)
    .single();

  if (!emp) throw new Error("Employé introuvable");

  const grossSalary = Number(emp.base_salary);
  const grossAnnual = grossSalary * 12;

  // IR — Impôt sur le Revenu (barème progressif avec abattement 30%)
  const irResult = calculateIR(grossAnnual, "celibataire", 0);
  const irWithheld = Math.round((irResult.taxAmount / 12) * 100) / 100;

  // IPRES Part Salariale (plafonnée)
  const plafondMensuel = config.plafondSecuriteSociale / 12;
  const basePlafonnee = Math.min(grossSalary, plafondMensuel);
  const ipresEmployee = Math.round((basePlafonnee * config.ipresPartSalariale) * 100) / 100;

  // CSS Part Salariale
  const cssEmployee = Math.round((basePlafonnee * config.cssPartSalariale) * 100) / 100;

  // Total retenues
  const totalDeductions = irWithheld + ipresEmployee + cssEmployee;
  const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

  // Charges patronales
  const isCadre = emp.social_regime?.toLowerCase().includes("cadre") ?? false;
  const ipresEmployer = Math.round((basePlafonnee * (isCadre ? config.ipresCadre : config.ipresRegimeGeneral)) * 100) / 100;
  const cssEmployer = Math.round((basePlafonnee * (config.cssPrestationsFamiliales + config.cssAccidentsTravail)) * 100) / 100;
  const cfceEmployer = Math.round((grossSalary * 0.03) * 100) / 100; // CFCE 3%

  const totalEmployerCharges = Math.round((ipresEmployer + cssEmployer + cfceEmployer) * 100) / 100;
  const totalCost = Math.round((grossSalary + totalEmployerCharges) * 100) / 100;

  return {
    employeeId,
    employeeName: emp.full_name,
    periodMonth,
    grossSalary,
    irWithheld,
    ipresEmployee,
    cssEmployee,
    totalDeductions,
    ipresEmployer,
    cssEmployer,
    cfceEmployer,
    totalEmployerCharges,
    netSalary,
    totalCost,
  };
}

// ---------------------------------------------------------------------------
// 2. GÉNÉRATION DE MASSE (tous les employés actifs)
// ---------------------------------------------------------------------------

export async function generateBulkPayslips(periodMonth: string): Promise<PayslipDetail[]> {
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true);

  if (!employees || employees.length === 0) return [];

  const results: PayslipDetail[] = [];
  for (const emp of employees) {
    const detail = await calculatePayslip(emp.id, periodMonth);
    results.push(detail);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3. GÉNÉRATION DNS — Déclaration Nominative des Salaires (IPRES/CSS)
// ---------------------------------------------------------------------------

export async function generateDNSDeclaration(year: number): Promise<{ total: number; lines: { employee: string; gross: number; ipres: number; css: number; ir: number }[] }> {
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .eq("active", true);

  if (!employees || employees.length === 0) return { total: 0, lines: [] };

  const lines: { employee: string; gross: number; ipres: number; css: number; ir: number }[] = [];
  let total = 0;

  for (const emp of employees) {
    const grossAnnual = Number(emp.base_salary) * 12;
    const plafondMensuel = DEFAULT_CONFIG.plafondSecuriteSociale / 12;
    const basePlafonnee = Math.min(Number(emp.base_salary), plafondMensuel);

    const irResult = calculateIR(grossAnnual, "celibataire", 0);
    const ipresAnnuel = basePlafonnee * DEFAULT_CONFIG.ipresPartSalariale * 12;
    const cssAnnuel = basePlafonnee * DEFAULT_CONFIG.cssPartSalariale * 12;

    lines.push({
      employee: emp.full_name,
      gross: grossAnnual,
      ipres: Math.round(ipresAnnuel * 100) / 100,
      css: Math.round(cssAnnuel * 100) / 100,
      ir: Math.round(irResult.taxAmount * 100) / 100,
    });
    total += grossAnnual;
  }

  return { total, lines };
}

// ---------------------------------------------------------------------------
// 4. PROVISIONS POUR CONGÉS PAYÉS (CCNI Sénégal)
// ---------------------------------------------------------------------------

export function calculateLeaveProvision(
  grossSalary: number,
  monthsWorked: number = 12,
  leaveRate: number = 0.1667  // 2.5 jours/mois = 30/12 = 1/12 ≈ 8.33% du salaire = salaire / 12 ≈ 0.0833, arrondi à 0.1667 pour provisions prudentielles
): { provisionAmount: number; daysAccrued: number; journalEntry: { debit: string; credit: string; amount: number } } {
  const daysPerMonth = 2.5; // Droit congés CCNI Sénégal
  const daysAccrued = monthsWorked * daysPerMonth;
  const dailyRate = grossSalary / 30;
  const provisionAmount = Math.round((dailyRate * daysAccrued) * 100) / 100;

  return {
    provisionAmount,
    daysAccrued,
    journalEntry: {
      debit: "661",   // Charges de personnel — provision congés
      credit: "421",   // Personnel — rémunérations dues
      amount: provisionAmount,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. INDEMNITÉS DE FIN DE CONTRAT (Licenciement / Démission)
// ---------------------------------------------------------------------------

export function calculateTerminationIndemnity(
  grossSalary: number,
  yearsOfService: number,
  reason: "licenciement" | "demission" | "retraite"
): {
  noticePeriodMonths: number;
  indemnityAmount: number;
  legalBasis: string;
} {
  // CCNI Sénégal :
  // - Licenciement : 1 mois de salaire par année de service (max 8 mois)
  // - Démission : 0.5 mois par année (max 3 mois)
  // - Retraite : 1 mois par année (max 6 mois)
  let monthsByYear: number;
  let maxMonths: number;
  let legalBasis: string;

  switch (reason) {
    case "licenciement":
      monthsByYear = 1;
      maxMonths = 8;
      legalBasis = "CCNI Sénégal — Indemnité de licenciement : 1 mois/année, max 8 mois";
      break;
    case "demission":
      monthsByYear = 0.5;
      maxMonths = 3;
      legalBasis = "CCNI Sénégal — Indemnité de démission : 0.5 mois/année, max 3 mois";
      break;
    case "retraite":
      monthsByYear = 1;
      maxMonths = 6;
      legalBasis = "CCNI Sénégal — Indemnité de départ à la retraite : 1 mois/année, max 6 mois";
      break;
  }

  const monthsOfIndemnity = Math.min(yearsOfService * monthsByYear, maxMonths);
  const indemnityAmount = Math.round((grossSalary * monthsOfIndemnity) * 100) / 100;

  return {
    noticePeriodMonths: reason === "licenciement" ? 1 : 0,
    indemnityAmount,
    legalBasis,
  };
}

// ---------------------------------------------------------------------------
// 6. COMPTABILISATION AUTOMATIQUE DE LA PAIE
// ---------------------------------------------------------------------------

export function generatePayrollEntry(detail: PayslipDetail, journalId: string): {
  lines: { account_code: string; debit: number; credit: number; label: string }[];
} {
  return {
    lines: [
      // Débit : Salaires bruts (661)
      { account_code: "661", debit: detail.grossSalary, credit: 0, label: `Salaire brut — ${detail.employeeName}` },
      // Débit : Charges patronales IPRES (664)
      { account_code: "664", debit: detail.ipresEmployer + detail.cssEmployer, credit: 0, label: "Charges patronales IPRES/CSS" },
      // Débit : CFCE (664 — charges sociales)
      { account_code: "664", debit: detail.cfceEmployer, credit: 0, label: "CFCE 3% masse salariale" },
      // Crédit : IR retenu (447)
      { account_code: "447", debit: 0, credit: detail.irWithheld, label: "IR retenu à la source" },
      // Crédit : IPRES salarié (431)
      { account_code: "431", debit: 0, credit: detail.ipresEmployee + detail.cssEmployee, label: "Cotisations sociales salariales" },
      // Crédit : Organismes sociaux — part patronale (431)
      { account_code: "431", debit: 0, credit: detail.ipresEmployer + detail.cssEmployer, label: "Cotisations sociales patronales" },
      // Crédit : Organismes sociaux — CFCE (431)
      { account_code: "431", debit: 0, credit: detail.cfceEmployer, label: "CFCE à reverser" },
      // Crédit : Net à payer (421)
      { account_code: "421", debit: 0, credit: detail.netSalary, label: `Net à payer — ${detail.employeeName}` },
    ],
  };
}