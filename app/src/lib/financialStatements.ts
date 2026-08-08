import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// Module 7 — États Financiers OHADA / SYSCOHADA
// Générés automatiquement à partir des écritures comptables.
// ============================================================================

// ---------------------------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------------------------

type Line = {
  account_code: string;
  label: string;
  debit: number;
  credit: number;
  class: number;
  account_type: string;
};

async function fetchLines(from: string, to: string): Promise<Line[]> {
  const { data } = await supabase
    .from("entry_lines")
    .select(`
      account_code, debit, credit,
      entries!inner(entry_date)
      `)
    .gte("entries.entry_date", from)
    .lte("entries.entry_date", to);

  // Récupère le libellé pour chaque code compte
  const codes = [...new Set((data ?? []).map((l) => l.account_code))];
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("code, label, class, account_type")
    .in("code", codes)
    .eq("company_id", COMPANY_ID);

  const labelMap = new Map((accounts ?? []).map((a) => [a.code, { label: a.label, class: a.class, account_type: a.account_type }]));

  return ((data ?? []) as unknown as Array<{ account_code: string; debit: number; credit: number; entries: { entry_date: string } }>).map((l) => {
    const meta = labelMap.get(l.account_code) ?? { label: l.account_code, class: 0, account_type: "charge" };
    return {
      account_code: l.account_code,
      label: meta.label,
      debit: Number(l.debit),
      credit: Number(l.credit),
      class: meta.class,
      account_type: meta.account_type,
    };
  });
}

function sumDebit(lines: Line[], codes: string[]): number {
  return lines.filter((l) => codes.some((c) => l.account_code.startsWith(c))).reduce((s, l) => s + l.debit, 0);
}

function sumCredit(lines: Line[], codes: string[]): number {
  return lines.filter((l) => codes.some((c) => l.account_code.startsWith(c))).reduce((s, l) => s + l.credit, 0);
}

function netBalance(lines: Line[], codes: string[], type: "actif" | "charge" | "passif" | "produit"): number {
  const d = sumDebit(lines, codes);
  const c = sumCredit(lines, codes);
  return type === "actif" || type === "charge" ? d - c : c - d;
}

// ---------------------------------------------------------------------------
// 7.1 BILAN (Actif / Passif)
// ---------------------------------------------------------------------------

export type BilanLine = {
  code: string;
  label: string;
  brut: number;
  amortissement: number;
  net: number;
};

export type Bilan = {
  actif: BilanLine[];
  passif: BilanLine[];
  total_actif: number;
  total_passif: number;
  date: string;
};

export async function generateBilan(from: string, to: string): Promise<Bilan> {
  const lines = await fetchLines(from, to);

  // Actif immobilisé (classe 2)
  const immoBrut = sumDebit(lines, ["2"]);
  const amortissements = sumCredit(lines, ["28"]);
  const actifImmo: BilanLine = {
    code: "2",
    label: "Actif immobilisé",
    brut: immoBrut,
    amortissement: amortissements,
    net: immoBrut - amortissements,
  };

  // Stocks (classe 3)
  const stocksNet = netBalance(lines, ["3"], "actif");
  const stocks: BilanLine = {
    code: "3",
    label: "Stocks",
    brut: stocksNet,
    amortissement: 0,
    net: stocksNet,
  };

  // Créances clients (411)
  const clientsNet = netBalance(lines, ["411"], "actif");
  const clients: BilanLine = {
    code: "411",
    label: "Clients",
    brut: clientsNet,
    amortissement: 0,
    net: clientsNet,
  };

  // TVA déductible (4452)
  const tvaDed = netBalance(lines, ["4452"], "actif");
  const tvaDeductible: BilanLine = {
    code: "4452",
    label: "TVA déductible",
    brut: tvaDed,
    amortissement: 0,
    net: tvaDed,
  };

  // Trésorerie (classe 5)
  const tresorerie = netBalance(lines, ["5"], "actif");
  const treso: BilanLine = {
    code: "5",
    label: "Trésorerie",
    brut: tresorerie,
    amortissement: 0,
    net: tresorerie,
  };

  // Capital (101)
  const capital = netBalance(lines, ["101"], "passif");

  // Réserves (106)
  const reserves = netBalance(lines, ["106"], "passif");

  // Résultat
  const produits = sumCredit(lines, ["7"]);
  const charges = sumDebit(lines, ["6"]);
  const resultat = produits - charges;

  // Dettes fournisseurs (401)
  const fournisseurs = netBalance(lines, ["401"], "passif");

  // Dettes sociales (431, 421)
  const dettesSociales = sumCredit(lines, ["421", "431", "441", "4441", "447"]);

  // Emprunts (161)
  const emprunts = netBalance(lines, ["161"], "passif");

  const actif: BilanLine[] = [actifImmo, stocks, clients, tvaDeductible, treso];
  const passif: BilanLine[] = [
    { code: "101", label: "Capital", brut: capital, amortissement: 0, net: capital },
    { code: "106", label: "Réserves", brut: reserves, amortissement: 0, net: reserves },
    { code: "12", label: "Résultat de l'exercice", brut: Math.abs(resultat), amortissement: 0, net: resultat },
    { code: "161", label: "Emprunts et dettes financières", brut: emprunts, amortissement: 0, net: emprunts },
    { code: "401", label: "Fournisseurs", brut: fournisseurs, amortissement: 0, net: fournisseurs },
    { code: "42-44", label: "Dettes sociales et fiscales", brut: dettesSociales, amortissement: 0, net: dettesSociales },
  ];

  return {
    actif,
    passif,
    total_actif: actif.reduce((s, l) => s + l.net, 0),
    total_passif: passif.reduce((s, l) => s + l.net, 0),
    date: `${from} → ${to}`,
  };
}

// ---------------------------------------------------------------------------
// 7.2 COMPTE DE RÉSULTAT
// ---------------------------------------------------------------------------

export type CompteResultatLine = {
  code: string;
  label: string;
  montant: number;
};

export type CompteResultat = {
  produits: CompteResultatLine[];
  charges: CompteResultatLine[];
  total_produits: number;
  total_charges: number;
  resultat_net: number;
  date: string;
};

export async function generateCompteResultat(from: string, to: string): Promise<CompteResultat> {
  const lines = await fetchLines(from, to);

  // Produits d'exploitation (701, 706, 707)
  const ventes = sumCredit(lines, ["701", "706", "707"]);
  const produitsAcc = sumCredit(lines, ["758"]);
  const produitsFin = sumCredit(lines, ["771"]);
  const gainsChange = sumCredit(lines, ["776"]);

  // Charges d'exploitation
  const achats = sumDebit(lines, ["601", "603", "604", "605"]);
  const transports = sumDebit(lines, ["611"]);
  const locations = sumDebit(lines, ["622"]);
  const entretien = sumDebit(lines, ["624"]);
  const assurances = sumDebit(lines, ["625"]);
  const publicite = sumDebit(lines, ["627"]);
  const telecom = sumDebit(lines, ["628"]);
  const fraisBanc = sumDebit(lines, ["631"]);
  const impotsTaxes = sumDebit(lines, ["641"]);
  const salaires = sumDebit(lines, ["661"]);
  const chargesSoc = sumDebit(lines, ["664"]);
  const dotAmort = sumDebit(lines, ["681"]);
  const pertesChange = sumDebit(lines, ["676"]);

  const produits: CompteResultatLine[] = [
    { code: "701-707", label: "Ventes et prestations de services", montant: ventes },
    { code: "758", label: "Produits divers", montant: produitsAcc },
    { code: "771", label: "Intérêts et produits financiers", montant: produitsFin },
    { code: "776", label: "Gains de change", montant: gainsChange },
  ];

  const chargesList: CompteResultatLine[] = [
    { code: "601-605", label: "Achats", montant: achats },
    { code: "611", label: "Transports", montant: transports },
    { code: "622", label: "Locations", montant: locations },
    { code: "624", label: "Entretien et réparations", montant: entretien },
    { code: "625", label: "Primes d'assurance", montant: assurances },
    { code: "627", label: "Publicité et communication", montant: publicite },
    { code: "628", label: "Frais de télécommunication", montant: telecom },
    { code: "631", label: "Frais bancaires", montant: fraisBanc },
    { code: "641", label: "Impôts et taxes", montant: impotsTaxes },
    { code: "661", label: "Rémunérations du personnel", montant: salaires },
    { code: "664", label: "Charges sociales", montant: chargesSoc },
    { code: "681", label: "Dotations aux amortissements", montant: dotAmort },
    { code: "676", label: "Pertes de change", montant: pertesChange },
  ];

  const totalProduits = produits.reduce((s, l) => s + l.montant, 0);
  const totalCharges = chargesList.reduce((s, l) => s + l.montant, 0);

  return {
    produits,
    charges: chargesList,
    total_produits: totalProduits,
    total_charges: totalCharges,
    resultat_net: totalProduits - totalCharges,
    date: `${from} → ${to}`,
  };
}

// ---------------------------------------------------------------------------
// 7.3 TABLEAU DES FLUX DE TRÉSORERIE (méthode indirecte)
// ---------------------------------------------------------------------------

export type FluxTresorerie = {
  flux_exploitation: { label: string; montant: number }[];
  flux_investissement: { label: string; montant: number }[];
  flux_financement: { label: string; montant: number }[];
  variation_tresorerie: number;
  tresorerie_ouverture: number;
  tresorerie_cloture: number;
  date: string;
};

export async function generateFluxTresorerie(from: string, to: string, previousFrom: string, previousTo: string): Promise<FluxTresorerie> {
  const lines = await fetchLines(from, to);
  const prevLines = await fetchLines(previousFrom, previousTo);

  // Résultat net
  const produits = sumCredit(lines, ["7"]);
  const charges = sumDebit(lines, ["6"]);
  const resultatNet = produits - charges;

  // Dotations aux amortissements (réintégrées)
  const dotations = sumDebit(lines, ["681"]);

  // Variation BFR
  const clientsN = netBalance(lines, ["411"], "actif");
  const clientsP = netBalance(prevLines, ["411"], "actif");
  const varClients = clientsN - clientsP;

  const fournN = netBalance(lines, ["401"], "passif");
  const fournP = netBalance(prevLines, ["401"], "passif");
  const varFournisseurs = fournN - fournP;

  const fluxExploitation = [
    { label: "Résultat net", montant: resultatNet },
    { label: "+ Dotations aux amortissements", montant: dotations },
    { label: "- Variation des créances clients", montant: -varClients },
    { label: "+ Variation des dettes fournisseurs", montant: varFournisseurs },
  ];

  // Flux investissement : acquisition/cession d'immobilisations
  const acqImmo = sumDebit(lines, ["2"]) - sumCredit(lines, ["28"]);
  const cessions = sumCredit(lines, ["462"]);
  const fluxInvestissement = [
    { label: "Acquisitions d'immobilisations", montant: -acqImmo },
    { label: "Cessions d'immobilisations", montant: cessions },
  ];

  // Flux financement
  const empruntsNouveaux = netBalance(lines, ["161"], "passif") - netBalance(prevLines, ["161"], "passif");
  const fluxFinancement = [
    { label: "Nouveaux emprunts", montant: empruntsNouveaux > 0 ? empruntsNouveaux : 0 },
    { label: "Remboursements d'emprunts", montant: empruntsNouveaux < 0 ? -empruntsNouveaux : 0 },
  ];

  // Trésorerie d'ouverture et de clôture
  const tresoCloture = netBalance(lines, ["5"], "actif");
  const tresoOuverture = netBalance(prevLines, ["5"], "actif");
  const variationFlux = fluxExploitation.reduce((s, l) => s + l.montant, 0)
    + fluxInvestissement.reduce((s, l) => s + l.montant, 0)
    + fluxFinancement.reduce((s, l) => s + l.montant, 0);

  return {
    flux_exploitation: fluxExploitation,
    flux_investissement: fluxInvestissement,
    flux_financement: fluxFinancement,
    variation_tresorerie: variationFlux,
    tresorerie_ouverture: tresoOuverture,
    tresorerie_cloture: tresoCloture,
    date: `${from} → ${to}`,
  };
}

// ---------------------------------------------------------------------------
// 7.4 VARIATION DES CAPITAUX PROPRES
// ---------------------------------------------------------------------------

export type VariationCapitauxPropres = {
  lignes: { label: string; ouverture: number; augmentation: number; diminution: number; cloture: number }[];
  total_ouverture: number;
  total_cloture: number;
};

export async function generateVariationCapitauxPropres(from: string, to: string): Promise<VariationCapitauxPropres> {
  const lines = await fetchLines(from, to);

  const capital = netBalance(lines, ["101"], "passif");
  const reserves = netBalance(lines, ["106"], "passif");
  const report = netBalance(lines, ["110"], "passif");
  const resultat = sumCredit(lines, ["7"]) - sumDebit(lines, ["6"]);

  const lignes = [
    { label: "Capital social", ouverture: capital, augmentation: 0, diminution: 0, cloture: capital },
    { label: "Réserves", ouverture: reserves, augmentation: 0, diminution: 0, cloture: reserves },
    { label: "Report à nouveau", ouverture: report, augmentation: 0, diminution: 0, cloture: report },
    { label: "Résultat de l'exercice", ouverture: 0, augmentation: resultat > 0 ? resultat : 0, diminution: resultat < 0 ? -resultat : 0, cloture: resultat },
  ];

  return {
    lignes,
    total_ouverture: lignes.reduce((s, l) => s + l.ouverture, 0),
    total_cloture: lignes.reduce((s, l) => s + l.cloture, 0),
  };
}

// ---------------------------------------------------------------------------
// 7.5 ANNEXES
// ---------------------------------------------------------------------------

export async function generateAnnexes(from: string, to: string): Promise<Record<string, unknown>> {
  const lines = await fetchLines(from, to);

  // Échéances des créances
  const clientsNet = netBalance(lines, ["411"], "actif");

  // Échéances des dettes
  const fournisseurs = netBalance(lines, ["401"], "passif");
  const dettesSociales = sumCredit(lines, ["421", "431", "441", "4441", "447"]);

  // Engagements hors bilan (depuis la table engagements)
  const { data: engagements } = await supabase
    .from("commitments") // table engagements_hors_bilan — à créer si besoin
    .select("*")
    .eq("company_id", COMPANY_ID)
    .limit(5);

  return {
    methodes_comptables: "États établis selon le référentiel SYSCOHADA révisé.",
    echeances_creances: {
      clients: clientsNet,
      // ventilé par échéance si données disponibles
    },
    echeances_dettes: {
      fournisseurs,
      dettes_sociales_fiscales: dettesSociales,
    },
    engagements_hors_bilan: engagements ?? [],
    evenements_post_cloture: [],
    date_etablissement: new Date().toISOString(),
  };
}