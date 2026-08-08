import { supabase, COMPANY_ID } from "@/lib/supabase";

// ============================================================================
// GÉNÉRATEUR DSF — Déclaration Statistique et Fiscale (format XML DGID Sénégal)
// Module critique pour le cabinet d'expertise comptable
// ============================================================================

export type DSFDeclaration = {
  id: string;
  fiscal_year: number;
  period_label: string;
  type: "mensuelle" | "trimestrielle" | "annuelle";
  declaration_date: string;
  turnover: number;
  vat_collected: number;
  vat_deductible: number;
  vat_net: number;
  income_tax: number;
  patente: number;
  cfce: number;
  xml_generated: boolean;
  status: "draft" | "ready" | "submitted" | "acknowledged";
};

/** Génère les données de la DSF à partir des écritures comptables */
export async function generateDSFData(fiscalYear: number, period: { from: string; to: string; label: string }) {
  // Récupère les lignes comptables
  const { data: lines } = await supabase
    .from("entry_lines")
    .select(`
      account_code, debit, credit,
      entries!inner(entry_date, company_id)
    `)
    .gte("entries.entry_date", period.from)
    .lte("entries.entry_date", period.to)
    .eq("entries.company_id", COMPANY_ID);

  if (!lines) throw new Error("Aucune écriture trouvée");

  // Calculs
  const sumDebit = (codes: string[]) =>
    lines.filter((l) => codes.some((c) => l.account_code.startsWith(c)))
      .reduce((s, l) => s + Number(l.debit), 0);

  const sumCredit = (codes: string[]) =>
    lines.filter((l) => codes.some((c) => l.account_code.startsWith(c)))
      .reduce((s, l) => s + Number(l.credit), 0);

  // Chiffre d'affaires (classe 7)
  const turnover = sumCredit(["701", "706", "707"]);

  // TVA collectée (4431)
  const vatCollected = sumCredit(["4431"]) - sumDebit(["4431"]);

  // TVA déductible (4452)
  const vatDeductible = sumDebit(["4452"]) - sumCredit(["4452"]);

  // Résultat fiscal approximatif
  const produits = sumCredit(["7"]);
  const charges = sumDebit(["6"]);
  const resultatFiscal = Math.max(0, produits - charges);

  // IS = 25% du résultat (taux standard Sénégal)
  const incomeTax = resultatFiscal * 0.25;

  // CFCE = 0.5% du CA (Contribution Forfaitaire)
  const cfce = turnover * 0.005;

  return {
    turnover: Math.round(turnover * 100) / 100,
    vat_collected: Math.round(vatCollected * 100) / 100,
    vat_deductible: Math.round(vatDeductible * 100) / 100,
    vat_net: Math.round((vatCollected - vatDeductible) * 100) / 100,
    income_tax: Math.round(incomeTax * 100) / 100,
    patente: 0,
    cfce: Math.round(cfce * 100) / 100,
  };
}

/** Enregistre une DSF et génère le XML DGID */
export async function createDSF(fiscalYear: number, period: { from: string; to: string; label: string; type: "mensuelle" | "trimestrielle" | "annuelle" }) {
  const data = await generateDSFData(fiscalYear, period);

  const { data: company } = await supabase
    .from("companies")
    .select("name, tax_id")
    .eq("id", COMPANY_ID)
    .single();

  // Génère le XML
  const xml = generateDSF_XML({
    companyName: company?.name ?? "",
    ninea: company?.tax_id ?? "",
    fiscalYear,
    periodLabel: period.label,
    ...data,
  });

  // Enregistre en base
  const { data: declaration, error } = await supabase
    .from("dsf_declarations")
    .insert({
      company_id: COMPANY_ID,
      fiscal_year: fiscalYear,
      period_label: period.label,
      type: period.type,
      declaration_date: new Date().toISOString().slice(0, 10),
      turnover: data.turnover,
      vat_collected: data.vat_collected,
      vat_deductible: data.vat_deductible,
      vat_net: data.vat_net,
      income_tax: data.income_tax,
      patente: data.patente,
      cfce: data.cfce,
      xml_generated: true,
      xml_content: xml,
      status: "ready",
    })
    .select("id")
    .single();

  if (error || !declaration) throw new Error(error?.message ?? "Échec création DSF");

  return { id: declaration.id, xml };
}

export function generateDSF_XML(params: {
  companyName: string;
  ninea: string;
  fiscalYear: number;
  periodLabel: string;
  turnover: number;
  vat_collected: number;
  vat_deductible: number;
  vat_net: number;
  income_tax: number;
  patente: number;
  cfce: number;
}): string {
  const a = "amp", l = "lt", g = "gt", q = "quot", ap = "apos";
  const escapeXml = (s: string) =>
    s.replace(/&/g, "&" + a + ";").replace(/</g, "&" + l + ";").replace(/>/g, "&" + g + ";").replace(/"/g, "&" + q + ";").replace(/'/g, "&" + ap + ";");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:dguid:senegal:dsf:2025">
  <Entete>
    <Version>1.0</Version>
    <DateGeneration>${new Date().toISOString()}</DateGeneration>
    <Logiciel>Compta Senegal v2.0</Logiciel>
  </Entete>
  <Contribuable>
    <RaisonSociale>${escapeXml(params.companyName)}</RaisonSociale>
    <NINEA>${escapeXml(params.ninea)}</NINEA>
    <Exercice>${params.fiscalYear}</Exercice>
    <Periode>${escapeXml(params.periodLabel)}</Periode>
  </Contribuable>
  <Declarations>
    <TVA>
      <ChiffreAffaires>${params.turnover.toFixed(2)}</ChiffreAffaires>
      <TvaCollectee>${params.vat_collected.toFixed(2)}</TvaCollectee>
      <TvaDeductible>${params.vat_deductible.toFixed(2)}</TvaDeductible>
      <TvaNet>${params.vat_net.toFixed(2)}</TvaNet>
    </TVA>
    <Impots>
      <IS>${params.income_tax.toFixed(2)}</IS>
      <Patente>${params.patente.toFixed(2)}</Patente>
      <CFCE>${params.cfce.toFixed(2)}</CFCE>
    </Impots>
  </Declarations>
  <Signature>
    <DateSignature>${new Date().toISOString().slice(0, 10)}</DateSignature>
    <LogicielEmetteur>Compta Senegal - Cabinet</LogicielEmetteur>
  </Signature>
</Declaration>`;
}

/** Récupère l'historique des déclarations DSF */
export async function fetchDSFHistory(): Promise<DSFDeclaration[]> {
  const { data } = await supabase
    .from("dsf_declarations")
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("fiscal_year", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    fiscal_year: r.fiscal_year,
    period_label: r.period_label,
    type: r.type as DSFDeclaration["type"],
    declaration_date: r.declaration_date,
    turnover: Number(r.turnover),
    vat_collected: Number(r.vat_collected),
    vat_deductible: Number(r.vat_deductible),
    vat_net: Number(r.vat_net),
    income_tax: Number(r.income_tax),
    patente: Number(r.patente),
    cfce: Number(r.cfce),
    xml_generated: r.xml_generated,
    status: r.status as DSFDeclaration["status"],
  }));
}