// ============================================================================
// BIBLIOTHÈQUE D'ALGORITHMES COMPTABLES & FISCAUX (SYSCOHADA / Sénégal)
// ============================================================================

// ---------------------------------------------------------------------------
// ALGO 1 : RAPPROCHEMENT MULTI-CRITÈRES (Fuzzy Matching Engine)
// Score pondéré : montant (40%) + date (20%) + texte (20%) + identifiant (20%)
// ---------------------------------------------------------------------------

export type MatchingCandidate = {
  id: string;
  amount: number;
  date: string;
  reference: string;
  entityId?: string;  // NINEA ou téléphone
};

export type MatchingResult = {
  candidateId: string;
  score: number;
  confidence: "auto_exact" | "auto_fuzzy" | "manual_review" | "ignore";
  breakdown: { montant: number; date: number; texte: number; identifiant: number };
};

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) { matrix[i][j] = j; continue; }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function calculateSimilarityScore(
  transaction: MatchingCandidate,
  invoice: MatchingCandidate
): MatchingResult {
  // 1. Matching Montant Exact (40% poids)
  const amountDiff = Math.abs(transaction.amount - invoice.amount);
  const sMontant = amountDiff < 0.01 ? 1.0 : amountDiff < 10 ? 0.8 : amountDiff < 100 ? 0.5 : 0.0;

  // 2. Matching Fenêtre Temporelle — Exponential Decay sur 30 jours (20% poids)
  const dateDiff = Math.abs(
    (new Date(transaction.date).getTime() - new Date(invoice.date).getTime()) / 86400000
  );
  const sDate = Math.max(0, 1.0 - dateDiff / 30);

  // 3. Matching Texte — Levenshtein normalisé (20% poids)
  const txLabel = transaction.reference.toLowerCase();
  const invLabel = invoice.reference.toLowerCase();
  const distance = levenshteinDistance(txLabel, invLabel);
  const maxLen = Math.max(txLabel.length, invLabel.length);
  const sTexte = maxLen > 0 ? 1.0 - distance / maxLen : 0.0;

  // 4. Identifiant (NINEA ou Téléphone) (20% poids)
  const sIdentifiant =
    transaction.entityId && invoice.entityId && transaction.entityId === invoice.entityId
      ? 1.0 : 0.0;

  // Score pondéré final
  const totalScore = 0.4 * sMontant + 0.2 * sDate + 0.2 * sTexte + 0.2 * sIdentifiant;

  const confidence: MatchingResult["confidence"] =
    totalScore >= 0.90 ? "auto_exact"
    : totalScore >= 0.70 ? "auto_fuzzy"
    : totalScore >= 0.40 ? "manual_review"
    : "ignore";

  return {
    candidateId: invoice.id,
    score: Math.round(totalScore * 100) / 100,
    confidence,
    breakdown: { montant: sMontant, date: sDate, texte: sTexte, identifiant: sIdentifiant },
  };
}

// ---------------------------------------------------------------------------
// ALGO 3 : MOTEUR D'IMPUTATION FISCAL AUTOMATIQUE (HT / TVA / BRS)
// Exemple : Facture de 1 180 000 (HT 1M, TVA 180k, BRS 5%)
// Écritures résultantes :
//   Débit 60x : 950 000 FCFA (net après BRS)
//   Débit 4452 : 180 000 FCFA (TVA déductible)
//   Crédit 447 : 50 000 FCFA (BRS à reverser au Trésor)
//   Crédit 401 : 1 080 000 FCFA (net à payer au fournisseur)
// ---------------------------------------------------------------------------

export type FiscalImputationParams = {
  amountHt: number;           // Montant HT
  tvaRate: number;            // ex: 0.18
  vatDeductible: boolean;     // TVA déductible ou non
  brsRate: number;            // ex: 0.05 (5%), 0.02 (2%), 0.20 (20%), ou 0
  brsNature: "prestation_locale" | "derogatoire" | "non_resident" | "none";
  chargeAccountCode: string;  // ex: '601', '605', '622'
  supplierAccountCode: string;// ex: '401'
  prepaymentTva: boolean;     // Précompte TVA actif ?
  prepaymentTvaRate?: number; // Taux de précompte (ex: 0.50 pour 50%)
};

export type FiscalImputationResult = {
  lines: {
    account_code: string;
    debit: number;
    credit: number;
    label: string;
  }[];
  netToSupplier: number;
  brsAmount: number;
  vatAmount: number;
  chargeNet: number;
};

export function computeFiscalImputation(params: FiscalImputationParams): FiscalImputationResult {
  const vatAmount = params.amountHt * params.tvaRate;
  const brsAmount = params.brsRate > 0 ? params.amountHt * params.brsRate : 0;

  // Précompte TVA : l'entreprise retient une partie de la TVA pour la reverser directement
  let prepaymentAmount = 0;
  if (params.prepaymentTva && params.prepaymentTvaRate) {
    prepaymentAmount = vatAmount * params.prepaymentTvaRate;
  }

  // Charge nette (après BRS)
  const chargeNet = params.amountHt - brsAmount;

  // Net à payer au fournisseur
  const netToSupplier = params.amountHt + vatAmount - brsAmount - prepaymentAmount;

  const lines: FiscalImputationResult["lines"] = [];

  // Débit : Charge (601, 605, etc.) — net après BRS
  lines.push({
    account_code: params.chargeAccountCode,
    debit: chargeNet,
    credit: 0,
    label: `Achat — HT ${params.amountHt} BRS ${params.brsRate * 100}%`,
  });

  // Débit : TVA déductible (4452)
  if (params.vatDeductible && vatAmount > 0) {
    lines.push({
      account_code: "4452",
      debit: vatAmount - prepaymentAmount,
      credit: 0,
      label: `TVA déductible ${params.tvaRate * 100}%`,
    });
  }

  // Crédit : BRS à reverser (447)
  if (brsAmount > 0) {
    lines.push({
      account_code: "447",
      debit: 0,
      credit: brsAmount,
      label: `BRS ${params.brsRate * 100}% à reverser — ${params.brsNature}`,
    });
  }

  // Crédit : Précompte TVA (4431)
  if (prepaymentAmount > 0) {
    lines.push({
      account_code: "4431",
      debit: 0,
      credit: prepaymentAmount,
      label: `Précompte TVA retenu ${params.prepaymentTvaRate! * 100}%`,
    });
  }

  // Crédit : Fournisseur (401) — net à payer
  lines.push({
    account_code: params.supplierAccountCode,
    debit: 0,
    credit: netToSupplier,
    label: `Net à payer au fournisseur`,
  });

  return {
    lines,
    netToSupplier: Math.round(netToSupplier * 100) / 100,
    brsAmount: Math.round(brsAmount * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    chargeNet: Math.round(chargeNet * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// ALGO 4 : CALCUL DE L'IMPÔT SUR LE REVENU (IR) — Barème Sénégalais Progressif
// ---------------------------------------------------------------------------

export type IRBracket = {
  min: number;        // Tranche min (annuelle)
  max: number | null; // Tranche max (null = infini)
  rate: number;       // Taux marginal
};

export const IR_BAREME_SENEGAL: IRBracket[] = [
  { min: 0, max: 630000, rate: 0.00 },
  { min: 630001, max: 1500000, rate: 0.20 },
  { min: 1500001, max: 4000000, rate: 0.30 },
  { min: 4000001, max: 8000000, rate: 0.35 },
  { min: 8000001, max: 13500000, rate: 0.37 },
  { min: 13500001, max: null, rate: 0.40 },
];
const IR_ABATTEMENT = 0.30; // Abattement 30% sur le salaire brut annuel
const IR_PARTS_BASE = 1;   // 1 part pour célibataire
const IR_PARTS_MARIE = 1.5; // +0.5 par enfant à charge (jusqu'à 3 max)

export function calculateIR(
  annualGrossSalary: number,
  maritalStatus: "celibataire" | "marie",
  dependents: number  // nombre d'enfants à charge (max 3)
): { taxableIncome: number; taxAmount: number; monthlyWithholding: number; brackets: { rate: number; amount: number }[] } {
  // Abattement 30%
  const afterAbattement = annualGrossSalary * (1 - IR_ABATTEMENT);

  // Quotient familial
  const parts = maritalStatus === "marie" ? IR_PARTS_MARIE + Math.min(dependents, 3) * 0.5 : IR_PARTS_BASE + Math.min(dependents, 3) * 0.5;
  const taxablePerPart = afterAbattement / parts;

  // Calcul progressif par tranche (sur le revenu par part)
  let taxPerPart = 0;
  const brackets: { rate: number; amount: number }[] = [];

  for (let i = 0; i < IR_BAREME_SENEGAL.length; i++) {
    const bracket = IR_BAREME_SENEGAL[i];
    if (taxablePerPart <= bracket.min) break;

    const bracketMin = bracket.min - 1 < 0 ? 0 : bracket.min - 1;
    const taxableInBracket = bracket.max
      ? Math.min(taxablePerPart, bracket.max) - bracketMin
      : Math.max(0, taxablePerPart - bracketMin);

    const taxInBracket = taxableInBracket * bracket.rate;
    taxPerPart += taxInBracket;
    brackets.push({ rate: bracket.rate, amount: Math.round(taxInBracket * 100) / 100 });
  }

  const totalTax = taxPerPart * parts;
  const monthlyWithholding = totalTax / 12;

  return {
    taxableIncome: Math.round(afterAbattement * 100) / 100,
    taxAmount: Math.round(totalTax * 100) / 100,
    monthlyWithholding: Math.round(monthlyWithholding * 100) / 100,
    brackets,
  };
}

// ---------------------------------------------------------------------------
// ALGO 5 : AMORTISSEMENT LINÉAIRE & PRORATA 360 JOURS
// ---------------------------------------------------------------------------

export function calculateLinearDepreciation(
  acquisitionValue: number,
  usefulLifeMonths: number,
  acquisitionDate: string, // ISO date
  fiscalYearStart: string   // début d'exercice
): { annualDepreciation: number; monthlyDepreciation: number; firstYearProrata: number; accumulated: number } {
  const acq = new Date(acquisitionDate);
  const yearStart = new Date(fiscalYearStart);

  // Taux linéaire
  const annualRate = 1 / (usefulLifeMonths / 12);
  const annualDepreciation = Math.round((acquisitionValue * annualRate) * 100) / 100;
  const monthlyDepreciation = Math.round((annualDepreciation / 12) * 100) / 100;

  // Prorata temporis première année (base 360 jours)
  const monthsRemaining = 12 - (acq.getMonth() - yearStart.getMonth()) - (acq.getDate() > 15 ? 1 : 0);
  const firstYearProrata = Math.round((monthlyDepreciation * Math.max(monthsRemaining, 1)) * 100) / 100;

  // Amortissement cumulé (depuis acquisition)
  const today = new Date();
  const monthsSinceAcq = (today.getFullYear() - acq.getFullYear()) * 12 + (today.getMonth() - acq.getMonth());
  const accumulated = Math.min(monthlyDepreciation * Math.max(monthsSinceAcq, 0), acquisitionValue);

  return {
    annualDepreciation,
    monthlyDepreciation,
    firstYearProrata,
    accumulated: Math.round(accumulated * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// ALGO 9 : SCORING DE RISQUE CLIENT & PÉNALITÉS DE RETARD (BCEAO)
// ---------------------------------------------------------------------------

export function calculateOverduePenalty(
  invoiceAmount: number,
  dueDate: string,
  paymentDate: string,
  annualInterestRate: number = 0.15 // 15% BCEAO taux usuraire max
): { daysOverdue: number; penaltyAmount: number; totalDue: number } {
  const due = new Date(dueDate);
  const paid = new Date(paymentDate);
  const daysOverdue = Math.max(0, Math.floor((paid.getTime() - due.getTime()) / 86400000));

  // Intérêts de retard = Montant × (taux/360) × jours de retard
  const dailyRate = annualInterestRate / 360;
  const penaltyAmount = Math.round((invoiceAmount * dailyRate * daysOverdue) * 100) / 100;

  return {
    daysOverdue,
    penaltyAmount,
    totalDue: Math.round((invoiceAmount + penaltyAmount) * 100) / 100,
  };
}

export function calculateClientRiskScore(params: {
  avgPaymentDelay: number;        // jours moyens de retard
  unpaidInvoicesCount: number;
  totalUnpaidAmount: number;
  hasLitigation: boolean;
  overdueRate: number;            // % factures en retard
}): { score: number; level: "faible" | "moyen" | "élevé" | "critique"; recommendation: string } {
  let score = 100;

  if (params.avgPaymentDelay > 30) score -= 20;
  else if (params.avgPaymentDelay > 15) score -= 10;
  if (params.unpaidInvoicesCount > 5) score -= 15;
  else if (params.unpaidInvoicesCount > 2) score -= 5;
  if (params.totalUnpaidAmount > 10000000) score -= 20;
  else if (params.totalUnpaidAmount > 1000000) score -= 10;
  if (params.hasLitigation) score -= 25;
  if (params.overdueRate > 0.5) score -= 15;
  else if (params.overdueRate > 0.2) score -= 5;

  score = Math.max(0, Math.min(100, score));

  const level = score >= 80 ? "faible" : score >= 50 ? "moyen" : score >= 25 ? "élevé" : "critique";
  const recommendation =
    level === "faible" ? "Paiement standard autorisé"
    : level === "moyen" ? "Surveillance accrue, limite de crédit à 50%"
    : level === "élevé" ? "Paiement exigé à la commande, garantie bancaire recommandée"
    : "Blocage total, contentieux à engager";

  return { score, level, recommendation };
}

// ---------------------------------------------------------------------------
// UTILITAIRES : ÉQUILIBRE D'UNE ÉCRITURE
// ---------------------------------------------------------------------------

export function checkEntryBalance(lines: { debit: number; credit: number }[]): { balanced: boolean; totalDebit: number; totalCredit: number; diff: number } {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return {
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    diff: Math.round((totalDebit - totalCredit) * 100) / 100,
  };
}